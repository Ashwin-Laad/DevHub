import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { Activity } from '../src/models/Activity.js';
import { Issue } from '../src/models/Issue.js';
import { Label } from '../src/models/Label.js';
import { Membership } from '../src/models/Membership.js';
import { Organization } from '../src/models/Organization.js';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { resolvers } from '../src/graphql/resolvers/index.js';
import { typeDefs } from '../src/graphql/schema/index.js';
import { registerUser } from '../src/services/authService.js';

const server = new ApolloServer({ typeDefs, resolvers });
const mongoUri = process.env.MONGODB_PROJECT_TEST_URI || 'mongodb://127.0.0.1:27017/devhub_project_test';
const password = 'correct-horse-battery';
let admin;
let manager;
let developer;
let outsider;
let organizationId;
let otherOrganizationId;
let projectId;

async function cleanDatabase() {
  await Promise.all([
    Activity.deleteMany({}),
    Issue.deleteMany({}),
    Label.deleteMany({}),
    Membership.deleteMany({}),
    Organization.deleteMany({}),
    Project.deleteMany({}),
    User.deleteMany({}),
  ]);
}

before(async () => {
  await mongoose.connect(mongoUri);
  await Promise.all([Membership.init(), Project.init(), User.init()]);
  await cleanDatabase();
  await server.start();

  admin = await registerUser({ name: 'Admin', email: 'project-admin@example.com', password });
  manager = await registerUser({ name: 'Manager', email: 'project-manager@example.com', password });
  developer = await registerUser({ name: 'Developer', email: 'project-developer@example.com', password });
  outsider = await registerUser({ name: 'Outsider', email: 'project-outsider@example.com', password });

  const organization = await Organization.create({ name: 'Project org' });
  const otherOrganization = await Organization.create({ name: 'Other org' });
  organizationId = organization.id;
  otherOrganizationId = otherOrganization.id;
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

function createProjectMutation(user, orgId = organizationId, name = 'Web app') {
  return execute(`
    mutation {
      createProject(input: { organizationId: "${orgId}", name: "${name}", description: "Initial description" }) {
        id name description status organization { id } createdBy { id email }
      }
    }
  `, user);
}

test('projects', async (t) => {
  await t.test('creation requires authentication', async () => {
    const result = await createProjectMutation(null);
    assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(await Project.countDocuments(), 0);
  });

  await t.test('unexpected database errors are not exposed to clients', async (t2) => {
    t2.mock.method(Project, 'create', async () => {
      throw new Error('private database connection detail');
    });

    const result = await createProjectMutation(admin);

    assert.equal(result.errors?.[0]?.extensions?.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(result.errors?.[0]?.message, 'An unexpected error occurred.');
    assert.doesNotMatch(result.errors?.[0]?.message ?? '', /private database/);
  });

  await t.test('ADMIN can create a project with ACTIVE status and authenticated creator', async () => {
    const result = await createProjectMutation(admin);

    assert.equal(result.errors, undefined);
    projectId = result.data.createProject.id;
    assert.equal(result.data.createProject.status, 'ACTIVE');
    assert.equal(result.data.createProject.organization.id, organizationId);
    assert.equal(result.data.createProject.createdBy.id, admin.id);
    assert.equal(result.data.createProject.description, 'Initial description');
  });

  await t.test('PROJECT_MANAGER may create projects', async () => {
    const result = await createProjectMutation(manager, organizationId, 'Manager project');
    assert.equal(result.errors, undefined);
    assert.equal(result.data.createProject.createdBy.id, manager.id);
  });

  await t.test('DEVELOPER and non-members cannot create projects', async () => {
    const developerResult = await createProjectMutation(developer);
    const outsiderResult = await createProjectMutation(outsider);

    assert.equal(developerResult.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(outsiderResult.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('invalid organization IDs and nonexistent organizations are rejected', async () => {
    const invalid = await createProjectMutation(admin, 'not-an-id');
    const missing = await createProjectMutation(admin, '64b8f0f2c2a1f2b3d4e5f678');

    assert.equal(invalid.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missing.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('project name and update inputs are validated', async () => {
    const emptyName = await createProjectMutation(admin, organizationId, '   ');
    const noUpdates = await execute(`mutation { updateProject(input: { projectId: "${projectId}" }) { id } }`, admin);

    assert.equal(emptyName.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(noUpdates.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('organization and personal project lists enforce membership and avoid duplicates', async () => {
    const organizationProjects = await execute(`{ projects(organizationId: "${organizationId}") { id } }`, developer);
    const personalProjects = await execute('{ myProjects { id name } }', admin);
    const outsiderProjects = await execute(`{ projects(organizationId: "${organizationId}") { id } }`, outsider);
    const outsiderPersonal = await execute('{ myProjects { id } }', outsider);

    assert.equal(organizationProjects.errors, undefined);
    assert.equal(organizationProjects.data.projects.length, 2);
    assert.equal(personalProjects.errors, undefined);
    assert.equal(personalProjects.data.myProjects.length, 2);
    assert.equal(new Set(personalProjects.data.myProjects.map(({ id }) => id)).size, 2);
    assert.equal(outsiderProjects.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.deepEqual(outsiderPersonal.data.myProjects, []);
  });

  await t.test('project details require authenticated organization membership', async () => {
    const valid = await execute(`{ project(id: "${projectId}") { id name } }`, manager);
    const invalid = await execute('{ project(id: "bad-id") { id } }', admin);
    const missing = await execute('{ project(id: "64b8f0f2c2a1f2b3d4e5f678") { id } }', admin);
    const unauthorized = await execute(`{ project(id: "${projectId}") { id } }`, outsider);
    const anonymous = await execute(`{ project(id: "${projectId}") { id } }`, null);

    assert.equal(valid.errors, undefined);
    assert.equal(valid.data.project.id, projectId);
    assert.equal(invalid.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(missing.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(unauthorized.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(unauthorized.data.project, null);
  });

  await t.test('project relationships resolve through existing models', async () => {
    const result = await execute(`
      { project(id: "${projectId}") {
        organization { id }
        createdBy { id }
        members { role user { id } }
        issues { id }
        labels { id }
        activity { id }
      } }
    `, admin);

    assert.equal(result.errors, undefined);
    assert.equal(result.data.project.organization.id, organizationId);
    assert.equal(result.data.project.createdBy.id, admin.id);
    assert.equal(result.data.project.members.length, 3);
    assert.deepEqual(result.data.project.issues, []);
    assert.deepEqual(result.data.project.labels, []);
    assert.deepEqual(result.data.project.activity, []);
  });

  await t.test('only admins and project managers can update projects', async () => {
    const updated = await execute(`
      mutation { updateProject(input: { projectId: "${projectId}", name: "  Renamed ", description: "Updated" }) { name description status } }
    `, manager);
    const denied = await execute(`
      mutation { updateProject(input: { projectId: "${projectId}", name: "Denied" }) { name } }
    `, developer);
    const outsiderUpdate = await execute(`
      mutation { updateProject(input: { projectId: "${projectId}", name: "Denied" }) { name } }
    `, outsider);

    assert.equal(updated.errors, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(updated.data.updateProject)), {
      name: 'Renamed', description: 'Updated', status: 'ACTIVE',
    });
    assert.equal(denied.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(outsiderUpdate.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  await t.test('archive updates only status; authorized members can still retrieve and reactivate', async () => {
    const before = await Project.findById(projectId).lean();
    const archived = await execute(`mutation { archiveProject(id: "${projectId}") { id name description status } }`, manager);
    const storedAfterArchive = await Project.findById(projectId).lean();
    const retrieved = await execute(`{ project(id: "${projectId}") { id status } }`, developer);
    const deniedArchive = await execute(`mutation { archiveProject(id: "${projectId}") { id } }`, developer);
    const reactivated = await execute(`mutation { reactivateProject(id: "${projectId}") { status } }`, admin);

    assert.equal(archived.errors, undefined);
    assert.equal(archived.data.archiveProject.status, 'ARCHIVED');
    assert.equal(storedAfterArchive.name, before.name);
    assert.equal(storedAfterArchive.description, before.description);
    assert.equal(storedAfterArchive.organization.toString(), before.organization.toString());
    assert.equal(retrieved.errors, undefined);
    assert.equal(retrieved.data.project.status, 'ARCHIVED');
    assert.equal(deniedArchive.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(reactivated.errors, undefined);
    assert.equal(reactivated.data.reactivateProject.status, 'ACTIVE');
  });
});