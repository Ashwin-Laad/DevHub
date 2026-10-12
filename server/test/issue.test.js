import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { Activity } from '../src/models/Activity.js';
import { Comment } from '../src/models/Comment.js';
import { Issue } from '../src/models/Issue.js';
import { Label } from '../src/models/Label.js';
import { Membership } from '../src/models/Membership.js';
import { Notification } from '../src/models/Notification.js';
import { Organization } from '../src/models/Organization.js';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { resolvers } from '../src/graphql/resolvers/index.js';
import { typeDefs } from '../src/graphql/schema/index.js';
import { registerUser } from '../src/services/authService.js';

const server = new ApolloServer({ typeDefs, resolvers });
const mongoUri = process.env.MONGODB_ISSUE_TEST_URI || 'mongodb://127.0.0.1:27017/devhub_issue_test';
const password = 'correct-horse-battery';
let admin;
let manager;
let developer;
let outsider;
let projectId;
let otherProjectId;
let defaultIssueId;
let assignedIssueId;

async function cleanDatabase() {
  await Promise.all([
    Activity.deleteMany({}),
    Comment.deleteMany({}),
    Issue.deleteMany({}),
    Label.deleteMany({}),
    Membership.deleteMany({}),
    Notification.deleteMany({}),
    Organization.deleteMany({}),
    Project.deleteMany({}),
    User.deleteMany({}),
  ]);
}

before(async () => {
  await mongoose.connect(mongoUri);
  await Promise.all([Issue.init(), Label.init(), Membership.init(), User.init()]);
  await cleanDatabase();
  await server.start();

  admin = await registerUser({ name: 'Issue admin', email: 'issue-admin@example.com', password });
  manager = await registerUser({ name: 'Issue manager', email: 'issue-manager@example.com', password });
  developer = await registerUser({ name: 'Issue developer', email: 'issue-developer@example.com', password });
  outsider = await registerUser({ name: 'Issue outsider', email: 'issue-outsider@example.com', password });

  const organization = await Organization.create({ name: 'Issue org' });
  const otherOrganization = await Organization.create({ name: 'Other issue org' });
  const project = await Project.create({
    name: 'Issue project', organization: organization.id, createdBy: admin.id,
  });
  const otherProject = await Project.create({
    name: 'Other project', organization: otherOrganization.id, createdBy: outsider.id,
  });
  projectId = project.id;
  otherProjectId = otherProject.id;

  await Membership.create([
    { user: admin.id, organization: organization.id, role: 'ADMIN' },
    { user: manager.id, organization: organization.id, role: 'PROJECT_MANAGER' },
    { user: developer.id, organization: organization.id, role: 'DEVELOPER' },
    { user: outsider.id, organization: otherOrganization.id, role: 'ADMIN' },
  ]);
});

after(async () => {
  await cleanDatabase();
  await server.stop();
  await mongoose.disconnect();
});

async function execute(query, user) {
  const result = await server.executeOperation(
    { query },
    { contextValue: { userId: user ? user.id : null } },
  );
  return result.body.singleResult;
}

function createIssueMutation(user, project = projectId, fields = '') {
  return execute(`
    mutation {
      createIssue(input: { projectId: "${project}", title: "Issue title" ${fields} }) {
        id title description status priority creator { id } assignee { id }
      }
    }
  `, user);
}

test('issues', async (t) => {
  await t.test('creation requires authentication', async () => {
    const result = await createIssueMutation(null);
    assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(await Issue.countDocuments(), 0);
  });

  await t.test('creation derives creator and defaults status and priority', async () => {
    const result = await createIssueMutation(admin);

    assert.equal(result.errors, undefined);
    defaultIssueId = result.data.createIssue.id;
    assert.equal(result.data.createIssue.status, 'TODO');
    assert.equal(result.data.createIssue.priority, 'MEDIUM');
    assert.equal(result.data.createIssue.creator.id, admin.id);
    assert.equal(result.data.createIssue.assignee, null);
  });

  await t.test('creation validates membership, title, and assignee membership', async () => {
    const crossOrganization = await createIssueMutation(outsider);
    const invalidId = await createIssueMutation(admin, 'bad-id');
    const missingProject = await createIssueMutation(admin, '64b8f0f2c2a1f2b3d4e5f678');
    const invalidTitle = await execute(`
      mutation { createIssue(input: { projectId: "${projectId}", title: "   " }) { id } }
    `, admin);
    const invalidAssignee = await createIssueMutation(
      admin,
      projectId,
      `, assigneeId: "${outsider.id}"`,
    );

    assert.equal(crossOrganization.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(invalidId.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missingProject.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(invalidTitle.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(invalidAssignee.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('priority and initial assignee are validated and stored', async () => {
    const result = await createIssueMutation(
      manager,
      projectId,
      `, priority: URGENT, assigneeId: "${developer.id}"`,
    );

    assert.equal(result.errors, undefined);
    assignedIssueId = result.data.createIssue.id;
    assert.equal(result.data.createIssue.priority, 'URGENT');
    assert.equal(result.data.createIssue.assignee.id, developer.id);
    assert.equal(result.data.createIssue.creator.id, manager.id);
  });

  await t.test('project issue lists filter by status, priority, assignee, and paginate', async () => {
    await Issue.updateOne({ _id: assignedIssueId }, { $set: { status: 'IN_REVIEW' } });
    const all = await execute(`{ issues(projectId: "${projectId}") { id } }`, developer);
    const todo = await execute(`{ issues(projectId: "${projectId}", filter: { status: TODO }) { id } }`, developer);
    const inReview = await execute(`{ issues(projectId: "${projectId}", filter: { status: IN_REVIEW }) { id } }`, developer);
    const urgent = await execute(`{ issues(projectId: "${projectId}", filter: { priority: URGENT }) { id } }`, developer);
    const assigned = await execute(`{ issues(projectId: "${projectId}", filter: { assigneeId: "${developer.id}" }) { id } }`, developer);
    const unassigned = await execute('{ issues(projectId: "' + projectId + '", filter: { assigneeId: null }) { id } }', developer);
    const firstPage = await execute(`{ issues(projectId: "${projectId}", limit: 1, offset: 0) { id } }`, developer);
    const secondPage = await execute(`{ issues(projectId: "${projectId}", limit: 1, offset: 1) { id } }`, developer);
    const invalidLimit = await execute(`{ issues(projectId: "${projectId}", limit: 101) { id } }`, developer);
    const invalidFilter = await execute(`{ issues(projectId: "${projectId}", filter: { assigneeId: "bad-id" }) { id } }`, developer);
    const nullFilter = await execute(`{ issues(projectId: "${projectId}", filter: null) { id } }`, developer);

    assert.equal(all.data.issues.length, 2);
    assert.equal(todo.data.issues.length, 1);
    assert.equal(todo.data.issues[0].id, defaultIssueId);
    assert.equal(inReview.data.issues.length, 1);
    assert.equal(inReview.data.issues[0].id, assignedIssueId);
    assert.equal(urgent.data.issues.length, 1);
    assert.equal(urgent.data.issues[0].id, assignedIssueId);
    assert.equal(assigned.data.issues.length, 1);
    assert.equal(unassigned.data.issues.length, 1);
    assert.equal(nullFilter.data.issues.length, all.data.issues.length);
    assert.equal(firstPage.data.issues.length, 1);
    assert.equal(secondPage.data.issues.length, 1);
    assert.notEqual(firstPage.data.issues[0].id, secondPage.data.issues[0].id);
    assert.equal(invalidLimit.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(invalidFilter.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('issue listing and lookup prevent cross-organization access', async () => {
    const otherIssue = await createIssueMutation(outsider, otherProjectId);
    const inaccessibleList = await execute(`{ issues(projectId: "${otherProjectId}") { id } }`, admin);
    const inaccessibleIssue = await execute(`{ issue(id: "${otherIssue.data.createIssue.id}") { id } }`, admin);
    const invalidIssue = await execute('{ issue(id: "bad-id") { id } }', admin);
    const missingIssue = await execute('{ issue(id: "64b8f0f2c2a1f2b3d4e5f678") { id } }', admin);
    const anonymous = await execute(`{ issue(id: "${defaultIssueId}") { id } }`, null);

    assert.equal(otherIssue.errors, undefined);
    assert.equal(inaccessibleList.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(inaccessibleIssue.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(inaccessibleIssue.data.issue, null);
    assert.equal(invalidIssue.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missingIssue.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
  });

  await t.test('organization members may update issues but empty and invalid updates fail', async () => {
    const updated = await execute(`
      mutation { updateIssue(input: { issueId: "${defaultIssueId}", title: "  New title ", status: IN_PROGRESS, priority: HIGH }) { title status priority } }
    `, developer);
    const empty = await execute(`mutation { updateIssue(input: { issueId: "${defaultIssueId}" }) { id } }`, admin);
    const invalidEnum = await execute(`
      mutation { updateIssue(input: { issueId: "${defaultIssueId}", status: TODO }) { status } }
    `, admin);
    const rejectedEnum = await execute(`
      mutation { updateIssue(input: { issueId: "${defaultIssueId}", status: INVALID }) { status } }
    `, admin);
    const notMember = await execute(`
      mutation { updateIssue(input: { issueId: "${defaultIssueId}", title: "Denied" }) { title } }
    `, outsider);

    assert.equal(updated.errors, undefined);
    assert.equal(updated.data.updateIssue.title, 'New title');
    assert.equal(updated.data.updateIssue.status, 'IN_PROGRESS');
    assert.equal(updated.data.updateIssue.priority, 'HIGH');
    assert.equal(empty.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(invalidEnum.errors, undefined);
    assert.equal(invalidEnum.data.updateIssue.status, 'TODO');
    assert.ok(rejectedEnum.errors?.length);
    assert.equal(notMember.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('assignment is manager-only and validates same-organization users', async () => {
    const assigned = await execute(`
      mutation { assignIssue(input: { issueId: "${defaultIssueId}", assigneeId: "${manager.id}" }) { assignee { id } } }
    `, admin);
    const denied = await execute(`
      mutation { assignIssue(input: { issueId: "${defaultIssueId}", assigneeId: "${admin.id}" }) { id } }
    `, developer);
    const wrongOrg = await execute(`
      mutation { assignIssue(input: { issueId: "${defaultIssueId}", assigneeId: "${outsider.id}" }) { id } }
    `, manager);
    const badId = await execute(`
      mutation { assignIssue(input: { issueId: "${defaultIssueId}", assigneeId: "bad-id" }) { id } }
    `, admin);
    const missingUser = await execute(`
      mutation { assignIssue(input: { issueId: "${defaultIssueId}", assigneeId: "64b8f0f2c2a1f2b3d4e5f678" }) { id } }
    `, admin);
    const omitted = await execute(`mutation { assignIssue(input: { issueId: "${defaultIssueId}" }) { id } }`, admin);
    const unassigned = await execute(`
      mutation { assignIssue(input: { issueId: "${defaultIssueId}", assigneeId: null }) { assignee { id } } }
    `, manager);

    assert.equal(assigned.errors, undefined);
    assert.equal(assigned.data.assignIssue.assignee.id, manager.id);
    assert.equal(denied.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(wrongOrg.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(badId.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missingUser.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(omitted.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(unassigned.errors, undefined);
    assert.equal(unassigned.data.assignIssue.assignee, null);
  });

  await t.test('issue relationships resolve from existing records', async () => {
    const issue = await Issue.findById(defaultIssueId);
    const label = await Label.create({ name: 'bug', project: projectId });
    issue.labels = [label.id];
    await issue.save();
    await Comment.create({ content: 'Existing comment', issue: issue.id, author: manager.id });
    await Activity.create({
      type: 'ISSUE_CREATED', actor: admin.id, project: projectId, issue: issue.id,
    });

    const result = await execute(`
      { issue(id: "${defaultIssueId}") {
        project { id }
        creator { id }
        assignee { id }
        comments { content author { id } }
        labels { id name }
        activity { type actor { id } }
      } }
    `, admin);

    assert.equal(result.errors, undefined);
    assert.equal(result.data.issue.project.id, projectId);
    assert.equal(result.data.issue.creator.id, admin.id);
    assert.equal(result.data.issue.assignee, null);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.issue.comments)), [
      { content: 'Existing comment', author: { id: manager.id } },
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.issue.labels)), [
      { id: label.id, name: 'bug' },
    ]);
    assert.ok(result.data.issue.activity.some((activity) => activity.type === 'ISSUE_CREATED'));
    assert.ok(result.data.issue.activity.some((activity) => activity.actor.id === admin.id));
  });
});