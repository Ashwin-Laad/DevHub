import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { Activity } from '../src/models/Activity.js';
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
const mongoUri = process.env.MONGODB_ACTIVITY_TEST_URI || 'mongodb://127.0.0.1:27017/devhub_activity_test';
const password = 'correct-horse-battery';
let admin;
let manager;
let member;
let outsider;
let projectId;
let issueId;

async function cleanDatabase() {
  await Promise.all([
    Activity.deleteMany({}),
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
  await Promise.all([Activity.init(), Issue.init(), Notification.init(), Membership.init(), User.init()]);
  await cleanDatabase();
  await server.start();

  admin = await registerUser({ name: 'Events admin', email: 'events-admin@example.com', password });
  manager = await registerUser({ name: 'Events manager', email: 'events-manager@example.com', password });
  member = await registerUser({ name: 'Events member', email: 'events-member@example.com', password });
  outsider = await registerUser({ name: 'Events outsider', email: 'events-outsider@example.com', password });

  const organization = await Organization.create({ name: 'Events org' });
  const otherOrganization = await Organization.create({ name: 'Other events org' });
  const project = await Project.create({ name: 'Events project', organization: organization.id, createdBy: admin.id });
  projectId = project.id;

  await Membership.create([
    { user: admin.id, organization: organization.id, role: 'ADMIN' },
    { user: manager.id, organization: organization.id, role: 'PROJECT_MANAGER' },
    { user: member.id, organization: organization.id, role: 'DEVELOPER' },
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

test('activity and notifications', async (t) => {
  await t.test('failed issue mutations do not create activity or notifications', async () => {
    const result = await execute(`
      mutation { createIssue(input: { projectId: "${projectId}", title: "   " }) { id } }
    `, admin);

    assert.equal(result.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(await Activity.countDocuments(), 0);
    assert.equal(await Notification.countDocuments(), 0);
  });

  await t.test('issue creation and assignment create activities and notify only the new assignee', async () => {
    const created = await execute(`
      mutation { createIssue(input: { projectId: "${projectId}", title: "Tracked issue" }) { id creator { id } } }
    `, admin);
    assert.equal(created.errors, undefined);
    issueId = created.data.createIssue.id;
    assert.equal(created.data.createIssue.creator.id, admin.id);

    const createdActivity = await Activity.findOne({ issue: issueId, type: 'ISSUE_CREATED' });
    assert.ok(createdActivity);
    assert.equal(createdActivity.actor.toString(), admin.id);
    assert.equal(createdActivity.project.toString(), projectId);
    assert.equal(createdActivity.metadata.status, 'TODO');

    const assigned = await execute(`
      mutation { assignIssue(input: { issueId: "${issueId}", assigneeId: "${manager.id}" }) { assignee { id } } }
    `, admin);
    assert.equal(assigned.errors, undefined);
    assert.equal(assigned.data.assignIssue.assignee.id, manager.id);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_ASSIGNED' }), 1);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'ISSUE_ASSIGNED', relatedIssue: issueId }), 1);
    assert.equal(await Notification.countDocuments({ recipient: admin.id, type: 'ISSUE_ASSIGNED', relatedIssue: issueId }), 0);

    const preassigned = await execute(`
      mutation { createIssue(input: { projectId: "${projectId}", title: "Preassigned", assigneeId: "${manager.id}" }) { id } }
    `, admin);
    assert.equal(preassigned.errors, undefined);
    assert.equal(await Activity.countDocuments({ issue: preassigned.data.createIssue.id, type: 'ISSUE_ASSIGNED' }), 1);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'ISSUE_ASSIGNED', relatedIssue: preassigned.data.createIssue.id }), 1);
  });

  await t.test('unchanged assignment creates no duplicate event or notification; unassignment is recorded', async () => {
    const unchanged = await execute(`
      mutation { assignIssue(input: { issueId: "${issueId}", assigneeId: "${manager.id}" }) { id } }
    `, admin);
    assert.equal(unchanged.errors, undefined);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_ASSIGNED' }), 1);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'ISSUE_ASSIGNED', relatedIssue: issueId }), 1);

    const selfAssigned = await execute(`
      mutation { assignIssue(input: { issueId: "${issueId}", assigneeId: "${admin.id}" }) { id } }
    `, admin);
    assert.equal(selfAssigned.errors, undefined);
    assert.equal(await Notification.countDocuments({ recipient: admin.id, type: 'ISSUE_ASSIGNED', relatedIssue: issueId }), 0);

    const unassigned = await execute(`
      mutation { assignIssue(input: { issueId: "${issueId}", assigneeId: null }) { assignee { id } } }
    `, manager);
    assert.equal(unassigned.errors, undefined);
    assert.equal(unassigned.data.assignIssue.assignee, null);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_ASSIGNED' }), 3);
    const lastAssignment = await Activity.findOne({ issue: issueId, type: 'ISSUE_ASSIGNED' }).sort({ createdAt: -1 });
    assert.equal(lastAssignment.metadata.assigneeId, null);
  });

  await t.test('status and priority changes are logged once and notify the assignee once', async () => {
    await execute(`mutation { assignIssue(input: { issueId: "${issueId}", assigneeId: "${manager.id}" }) { id } }`, admin);
    const updated = await execute(`
      mutation { updateIssue(input: { issueId: "${issueId}", status: IN_PROGRESS, priority: HIGH }) { status priority } }
    `, admin);
    assert.equal(updated.errors, undefined);
    assert.equal(updated.data.updateIssue.status, 'IN_PROGRESS');
    assert.equal(updated.data.updateIssue.priority, 'HIGH');
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_STATUS_CHANGED' }), 1);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_PRIORITY_CHANGED' }), 1);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'ISSUE_UPDATED', relatedIssue: issueId }), 1);
    assert.equal(await Notification.countDocuments({ recipient: admin.id, type: 'ISSUE_UPDATED', relatedIssue: issueId }), 0);

    const statusActivity = await Activity.findOne({ issue: issueId, type: 'ISSUE_STATUS_CHANGED' });
    const priorityActivity = await Activity.findOne({ issue: issueId, type: 'ISSUE_PRIORITY_CHANGED' });
    assert.deepEqual(statusActivity.metadata, { from: 'TODO', to: 'IN_PROGRESS' });
    assert.deepEqual(priorityActivity.metadata, { from: 'MEDIUM', to: 'HIGH' });

    await execute(`mutation { updateIssue(input: { issueId: "${issueId}", status: IN_PROGRESS, priority: HIGH }) { id } }`, admin);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_STATUS_CHANGED' }), 1);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'ISSUE_PRIORITY_CHANGED' }), 1);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'ISSUE_UPDATED', relatedIssue: issueId }), 1);
  });

  await t.test('comment creation logs activity and notifies unique participants except its author', async () => {
    const first = await execute(`
      mutation { createComment(input: { issueId: "${issueId}", content: "First" }) { id author { id } } }
    `, manager);
    assert.equal(first.errors, undefined);
    assert.equal(first.data.createComment.author.id, manager.id);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'COMMENT_CREATED', actor: manager.id }), 1);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'COMMENT_CREATED', relatedIssue: issueId }), 0);
    assert.equal(await Notification.countDocuments({ recipient: admin.id, type: 'COMMENT_CREATED', relatedIssue: issueId }), 1);

    const second = await execute(`
      mutation { createComment(input: { issueId: "${issueId}", content: "Second" }) { id } }
    `, admin);
    assert.equal(second.errors, undefined);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'COMMENT_CREATED' }), 2);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, type: 'COMMENT_CREATED', relatedIssue: issueId }), 1);
    assert.equal(await Notification.countDocuments({ recipient: admin.id, type: 'COMMENT_CREATED', relatedIssue: issueId }), 1);
  });

  await t.test('label attachment creates one activity and duplicate attachment creates none', async () => {
    const createdLabel = await execute(`
      mutation { createLabel(input: { projectId: "${projectId}", name: "triage" }) { id } }
    `, admin);
    const labelId = createdLabel.data.createLabel.id;
    const attach = `mutation { attachLabelToIssue(issueId: "${issueId}", labelId: "${labelId}") { id } }`;
    const first = await execute(attach, manager);
    const repeated = await execute(attach, admin);

    assert.equal(first.errors, undefined);
    assert.equal(repeated.errors, undefined);
    assert.equal(await Activity.countDocuments({ issue: issueId, type: 'LABEL_ADDED' }), 1);
    const activity = await Activity.findOne({ issue: issueId, type: 'LABEL_ADDED' });
    assert.equal(activity.actor.toString(), manager.id);
    assert.equal(activity.metadata.labelId, labelId);
  });

  await t.test('activity feeds are paginated and require issue or project membership', async () => {
    const issuePage = await execute(`{ issueActivity(issueId: "${issueId}", limit: 1) { id issue { id } } }`, member);
    const projectPage = await execute(`{ projectActivity(projectId: "${projectId}", limit: 2, offset: 0) { id project { id } } }`, admin);
    const inaccessibleIssue = await execute(`{ issueActivity(issueId: "${issueId}") { id } }`, outsider);
    const inaccessibleProject = await execute(`{ projectActivity(projectId: "${projectId}") { id } }`, outsider);
    const invalidPage = await execute(`{ issueActivity(issueId: "${issueId}", limit: 101) { id } }`, admin);

    assert.equal(issuePage.errors, undefined);
    assert.equal(issuePage.data.issueActivity.length, 1);
    assert.equal(projectPage.errors, undefined);
    assert.equal(projectPage.data.projectActivity.length, 2);
    assert.equal(inaccessibleIssue.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(inaccessibleProject.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(invalidPage.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('notification listing, ownership, pagination, and read state are recipient-scoped', async () => {
    const managerNotifications = await execute('{ myNotifications { id type read recipient { id } relatedIssue { id } } }', manager);
    const oneManagerNotification = await execute('{ myNotifications(limit: 1, offset: 0) { id } }', manager);
    const nextManagerNotification = await execute('{ myNotifications(limit: 1, offset: 1) { id } }', manager);
    const anonymous = await execute('{ myNotifications { id } }', null);
    const managerNotificationId = managerNotifications.data.myNotifications[0].id;
    const adminNotificationId = (await Notification.findOne({ recipient: admin.id })).id;
    const ownNotification = await execute(`{ notification(id: "${managerNotificationId}") { id recipient { id } read } }`, manager);
    const unauthorizedNotification = await execute(`{ notification(id: "${managerNotificationId}") { id } }`, admin);
    const invalidId = await execute('{ notification(id: "bad-id") { id } }', manager);
    const markRead = await execute(`mutation { markNotificationRead(id: "${managerNotificationId}") { id read } }`, manager);
    const wrongRecipientMark = await execute(`mutation { markNotificationRead(id: "${adminNotificationId}") { id read } }`, manager);
    const markedAllCount = await execute('mutation { markAllNotificationsRead }', manager);

    assert.ok(managerNotifications.data.myNotifications.length >= 3);
    assert.equal(managerNotifications.data.myNotifications[0].recipient.id, manager.id);
    assert.equal(oneManagerNotification.data.myNotifications.length, 1);
    assert.equal(nextManagerNotification.data.myNotifications.length, 1);
    assert.notEqual(oneManagerNotification.data.myNotifications[0].id, nextManagerNotification.data.myNotifications[0].id);
    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(ownNotification.errors, undefined);
    assert.equal(ownNotification.data.notification.recipient.id, manager.id);
    assert.equal(unauthorizedNotification.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(invalidId.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(markRead.errors, undefined);
    assert.equal(markRead.data.markNotificationRead.read, true);
    assert.equal(wrongRecipientMark.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(markedAllCount.errors, undefined);
    assert.ok(markedAllCount.data.markAllNotificationsRead >= 0);
    assert.equal(await Notification.countDocuments({ recipient: manager.id, read: false }), 0);
    assert.equal(await Notification.countDocuments({ recipient: admin.id, read: false }), 1);
  });
});