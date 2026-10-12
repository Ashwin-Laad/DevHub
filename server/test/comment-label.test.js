import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { Comment } from '../src/models/Comment.js';
import { Issue } from '../src/models/Issue.js';
import { Label } from '../src/models/Label.js';
import { Membership } from '../src/models/Membership.js';
import { Activity } from '../src/models/Activity.js';
import { Notification } from '../src/models/Notification.js';
import { Organization } from '../src/models/Organization.js';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { resolvers } from '../src/graphql/resolvers/index.js';
import { typeDefs } from '../src/graphql/schema/index.js';
import { registerUser } from '../src/services/authService.js';

const server = new ApolloServer({ typeDefs, resolvers });
const mongoUri = process.env.MONGODB_COMMENT_LABEL_TEST_URI || 'mongodb://127.0.0.1:27017/devhub_comment_label_test';
const password = 'correct-horse-battery';
let admin;
let manager;
let author;
let member;
let outsider;
let projectId;
let otherProjectId;
let issueId;
let commentId;
let labelId;
let otherLabelId;

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
  await Promise.all([Comment.init(), Issue.init(), Label.init(), Membership.init(), User.init()]);
  await cleanDatabase();
  await server.start();

  admin = await registerUser({ name: 'Comment admin', email: 'comment-admin@example.com', password });
  manager = await registerUser({ name: 'Comment manager', email: 'comment-manager@example.com', password });
  author = await registerUser({ name: 'Comment author', email: 'comment-author@example.com', password });
  member = await registerUser({ name: 'Comment member', email: 'comment-member@example.com', password });
  outsider = await registerUser({ name: 'Comment outsider', email: 'comment-outsider@example.com', password });

  const organization = await Organization.create({ name: 'Comment label org' });
  const otherOrganization = await Organization.create({ name: 'Other comment label org' });
  const project = await Project.create({ name: 'Main project', organization: organization.id, createdBy: admin.id });
  const otherProject = await Project.create({ name: 'Other project', organization: otherOrganization.id, createdBy: outsider.id });
  projectId = project.id;
  otherProjectId = otherProject.id;
  const issue = await Issue.create({ title: 'Issue', project: project.id, creator: admin.id });
  issueId = issue.id;

  await Membership.create([
    { user: admin.id, organization: organization.id, role: 'ADMIN' },
    { user: manager.id, organization: organization.id, role: 'PROJECT_MANAGER' },
    { user: author.id, organization: organization.id, role: 'DEVELOPER' },
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

function createComment(user, targetIssueId, content) {
  return execute(`
    mutation {
      createComment(input: { issueId: "${targetIssueId}", content: ${JSON.stringify(content)} }) {
        id content author { id } issue { id }
      }
    }
  `, user);
}

function createLabel(user, targetProjectId, name) {
  return execute(`
    mutation {
      createLabel(input: { projectId: "${targetProjectId}", name: ${JSON.stringify(name)} }) {
        id name project { id }
      }
    }
  `, user);
}

test('comments and labels', async (t) => {
  await t.test('comment creation requires membership and derives its author', async () => {
    const anonymous = await createComment(null, issueId, 'Unauthenticated');
    const outsiderResult = await createComment(outsider, issueId, 'Cross-organization');
    const created = await createComment(author, issueId, '  Useful comment  ');

    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(outsiderResult.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(created.errors, undefined);
    commentId = created.data.createComment.id;
    assert.equal(created.data.createComment.content, 'Useful comment');
    assert.equal(created.data.createComment.author.id, author.id);
    assert.equal(created.data.createComment.issue.id, issueId);
  });

  await t.test('comment content and issue IDs are validated', async () => {
    const empty = await createComment(author, issueId, '   ');
    const tooLong = await createComment(author, issueId, 'x'.repeat(5001));
    const badId = await createComment(author, 'not-an-id', 'Body');
    const missing = await createComment(author, '64b8f0f2c2a1f2b3d4e5f678', 'Body');

    assert.equal(empty.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(tooLong.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(badId.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missing.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('comment lists and lookup are scoped to issue membership', async () => {
    const listed = await execute(`{ comments(issueId: "${issueId}") { id author { id } } }`, member);
    const found = await execute(`{ comment(id: "${commentId}") { id content author { id } } }`, manager);
    const inaccessibleList = await execute(`{ comments(issueId: "${issueId}") { id } }`, outsider);
    const inaccessibleComment = await execute(`{ comment(id: "${commentId}") { id } }`, outsider);
    const badCommentId = await execute('{ comment(id: "bad-id") { id } }', author);

    assert.equal(listed.errors, undefined);
    assert.equal(listed.data.comments.length, 1);
    assert.equal(found.errors, undefined);
    assert.equal(found.data.comment.author.id, author.id);
    assert.equal(inaccessibleList.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(inaccessibleComment.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(badCommentId.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('authors may edit their comments; managers may moderate; other members may not', async () => {
    const ownEdit = await execute(`
      mutation { updateComment(input: { commentId: "${commentId}", content: "Edited by author" }) { content author { id } } }
    `, author);
    const denied = await execute(`
      mutation { updateComment(input: { commentId: "${commentId}", content: "Unauthorized edit" }) { content } }
    `, member);
    const moderatorEdit = await execute(`
      mutation { updateComment(input: { commentId: "${commentId}", content: "Moderated" }) { content author { id } } }
    `, manager);
    const empty = await execute(`
      mutation { updateComment(input: { commentId: "${commentId}", content: "   " }) { content } }
    `, author);
    const missing = await execute('mutation { updateComment(input: { commentId: "64b8f0f2c2a1f2b3d4e5f678", content: "x" }) { id } }', author);

    assert.equal(ownEdit.errors, undefined);
    assert.equal(ownEdit.data.updateComment.content, 'Edited by author');
    assert.equal(ownEdit.data.updateComment.author.id, author.id);
    assert.equal(denied.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(moderatorEdit.errors, undefined);
    assert.equal(moderatorEdit.data.updateComment.content, 'Moderated');
    assert.equal(moderatorEdit.data.updateComment.author.id, author.id);
    assert.equal(empty.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missing.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('label creation validates manager access and duplicate names', async () => {
    const denied = await createLabel(member, projectId, 'blocked');
    const empty = await createLabel(admin, projectId, '  ');
    const created = await createLabel(admin, projectId, '  bug  ');
    const duplicate = await createLabel(manager, projectId, 'bug');
    const otherProjectLabel = await createLabel(outsider, otherProjectId, 'other');
    const longName = await createLabel(admin, projectId, 'x'.repeat(51));

    assert.equal(denied.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(empty.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(created.errors, undefined);
    labelId = created.data.createLabel.id;
    assert.equal(created.data.createLabel.name, 'bug');
    assert.equal(created.data.createLabel.project.id, projectId);
    assert.equal(duplicate.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.match(duplicate.errors[0].message, /already exists/i);
    assert.equal(otherProjectLabel.errors, undefined);
    otherLabelId = otherProjectLabel.data.createLabel.id;
    assert.equal(longName.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('label queries are authorized and resolve their project', async () => {
    const listed = await execute(`{ labels(projectId: "${projectId}") { id name project { id } } }`, author);
    const fetched = await execute(`{ label(id: "${labelId}") { id name project { id } } }`, manager);
    const unauthorized = await execute(`{ label(id: "${labelId}") { id } }`, outsider);
    const invalid = await execute('{ labels(projectId: "bad-id") { id } }', admin);

    assert.equal(listed.errors, undefined);
    assert.equal(listed.data.labels.length, 1);
    assert.equal(listed.data.labels[0].project.id, projectId);
    assert.equal(fetched.errors, undefined);
    assert.equal(fetched.data.label.project.id, projectId);
    assert.equal(unauthorized.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(invalid.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('only managers may attach labels; duplicate attachment is idempotent', async () => {
    const denied = await execute(`mutation { attachLabelToIssue(issueId: "${issueId}", labelId: "${labelId}") { id } }`, author);
    const attached = await execute(`mutation { attachLabelToIssue(issueId: "${issueId}", labelId: "${labelId}") { labels { id name } } }`, admin);
    const attachedAgain = await execute(`mutation { attachLabelToIssue(issueId: "${issueId}", labelId: "${labelId}") { labels { id } } }`, manager);
    const wrongProject = await execute(`mutation { attachLabelToIssue(issueId: "${issueId}", labelId: "${otherLabelId}") { id } }`, admin);
    const badId = await execute(`mutation { attachLabelToIssue(issueId: "${issueId}", labelId: "bad-id") { id } }`, admin);
    const missingLabel = await execute('mutation { attachLabelToIssue(issueId: "' + issueId + '", labelId: "64b8f0f2c2a1f2b3d4e5f678") { id } }', admin);

    assert.equal(denied.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(attached.errors, undefined);
    assert.equal(attached.data.attachLabelToIssue.labels.length, 1);
    assert.equal(attachedAgain.errors, undefined);
    assert.equal(attachedAgain.data.attachLabelToIssue.labels.length, 1);
    assert.equal(await Issue.findById(issueId).then((issue) => issue.labels.length), 1);
    assert.equal(wrongProject.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(badId.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missingLabel.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('label removal updates issue refs and rejects unattached labels', async () => {
    const removed = await execute(`mutation { removeLabelFromIssue(issueId: "${issueId}", labelId: "${labelId}") { labels { id } } }`, manager);
    const removeAgain = await execute(`mutation { removeLabelFromIssue(issueId: "${issueId}", labelId: "${labelId}") { id } }`, admin);
    const outsiderAccess = await execute(`mutation { removeLabelFromIssue(issueId: "${issueId}", labelId: "${labelId}") { id } }`, outsider);
    const projectLabels = await execute(`{ labels(projectId: "${projectId}") { id } }`, admin);

    assert.equal(removed.errors, undefined);
    assert.deepEqual(removed.data.removeLabelFromIssue.labels, []);
    assert.equal(removeAgain.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(outsiderAccess.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.deepEqual(projectLabels.data.labels.map(({ id }) => id), [labelId]);
  });
});
