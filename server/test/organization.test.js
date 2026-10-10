import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { Membership } from '../src/models/Membership.js';
import { Organization } from '../src/models/Organization.js';
import { User } from '../src/models/User.js';
import { resolvers } from '../src/graphql/resolvers/index.js';
import { typeDefs } from '../src/graphql/schema/index.js';
import { registerUser } from '../src/services/authService.js';

const server = new ApolloServer({ typeDefs, resolvers });
// Separate database from auth.test.js, which runs in a parallel process.
const mongoUri = process.env.MONGODB_ORG_TEST_URI || 'mongodb://127.0.0.1:27017/devhub_org_test';
const password = 'correct-horse-battery';
let admin;
let developer;
let outsider;
let organizationId;

async function cleanDatabase() {
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Membership.deleteMany({}),
  ]);
}

before(async () => {
  await mongoose.connect(mongoUri);
  await Promise.all([User.init(), Membership.init()]);
  await cleanDatabase();
  await server.start();

  admin = await registerUser({ name: 'Admin', email: 'admin@example.com', password });
  developer = await registerUser({ name: 'Dev', email: 'dev@example.com', password });
  outsider = await registerUser({ name: 'Outsider', email: 'outsider@example.com', password });
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

function addMember(orgId, email, role, user) {
  return execute(`
    mutation {
      addOrganizationMember(input: { organizationId: "${orgId}", email: "${email}", role: ${role} }) {
        role
        user { email }
        organization { id }
      }
    }
  `, user);
}

test('organizations and memberships', async (t) => {
  await t.test('creating an organization requires authentication', async () => {
    const result = await execute('mutation { createOrganization(input: { name: "Acme" }) { id } }', null);

    assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(await Organization.countDocuments(), 0);
  });

  await t.test('creating an organization rejects an empty name', async () => {
    const result = await execute('mutation { createOrganization(input: { name: "   " }) { id } }', admin);

    assert.equal(result.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(await Organization.countDocuments(), 0);
  });

  await t.test('creating an organization makes the creator an ADMIN member', async () => {
    const result = await execute(`
      mutation {
        createOrganization(input: { name: " Acme " }) {
          id
          name
          members { role user { id email } }
        }
      }
    `, admin);

    assert.equal(result.errors, undefined);
    organizationId = result.data.createOrganization.id;
    assert.equal(result.data.createOrganization.name, 'Acme');
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.createOrganization.members)), [
      { role: 'ADMIN', user: { id: admin.id, email: 'admin@example.com' } },
    ]);
  });

  await t.test('a failed membership write does not leave an orphan organization', async (t2) => {
    t2.mock.method(Membership, 'create', async () => {
      throw new Error('simulated membership failure');
    });

    const result = await execute('mutation { createOrganization(input: { name: "Orphan" }) { id } }', admin);

    assert.ok(result.errors);
    assert.equal(await Organization.countDocuments({ name: 'Orphan' }), 0);
  });

  await t.test('myOrganizations lists only the authenticated user\'s organizations', async () => {
    const mine = await execute('{ myOrganizations { id name } }', admin);
    const theirs = await execute('{ myOrganizations { id } }', outsider);
    const anonymous = await execute('{ myOrganizations { id } }', null);

    assert.deepEqual(JSON.parse(JSON.stringify(mine.data.myOrganizations)), [{ id: organizationId, name: 'Acme' }]);
    assert.deepEqual(theirs.data.myOrganizations, []);
    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
  });

  await t.test('admin can add a member and duplicates are rejected', async () => {
    const added = await addMember(organizationId, ' DEV@example.com ', 'DEVELOPER', admin);

    assert.equal(added.errors, undefined);
    assert.equal(added.data.addOrganizationMember.role, 'DEVELOPER');
    assert.equal(added.data.addOrganizationMember.user.email, 'dev@example.com');
    assert.equal(added.data.addOrganizationMember.organization.id, organizationId);

    const duplicate = await addMember(organizationId, 'dev@example.com', 'PROJECT_MANAGER', admin);

    assert.equal(duplicate.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.match(duplicate.errors[0].message, /already a member/i);
    assert.equal(await Membership.countDocuments({ organization: organizationId }), 2);
  });

  await t.test('members can view the organization with member roles', async () => {
    const result = await execute(`
      { organization(id: "${organizationId}") { name members { role user { email } } } }
    `, developer);

    assert.equal(result.errors, undefined);
    assert.deepEqual(
      result.data.organization.members.map((member) => [member.user.email, member.role]),
      [['admin@example.com', 'ADMIN'], ['dev@example.com', 'DEVELOPER']],
    );
  });

  await t.test('exposed user data never includes password hashes', async () => {
    const result = await execute(`
      { organization(id: "${organizationId}") { members { user { passwordHash } } } }
    `, admin);

    assert.match(result.errors?.[0]?.message ?? '', /passwordHash/);
  });

  await t.test('non-members and missing organizations get the same NOT_FOUND error', async () => {
    const nonMember = await execute(`{ organization(id: "${organizationId}") { id } }`, outsider);
    const missing = await execute('{ organization(id: "64b8f0f2c2a1f2b3d4e5f678") { id } }', outsider);
    const invalid = await execute('{ organization(id: "not-an-id") { id } }', outsider);
    const anonymous = await execute(`{ organization(id: "${organizationId}") { id } }`, null);

    assert.equal(nonMember.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(missing.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(nonMember.errors[0].message, missing.errors[0].message);
    assert.equal(invalid.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(nonMember.data.organization, null);
  });

  await t.test('permission failures when adding members', async () => {
    const byNonAdmin = await addMember(organizationId, 'outsider@example.com', 'DEVELOPER', developer);
    const byOutsider = await addMember(organizationId, 'outsider@example.com', 'DEVELOPER', outsider);
    const anonymous = await addMember(organizationId, 'outsider@example.com', 'DEVELOPER', null);

    assert.equal(byNonAdmin.errors?.[0]?.extensions?.code, 'FORBIDDEN');
    assert.equal(byOutsider.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(anonymous.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(await Membership.countDocuments({ user: outsider.id }), 0);
  });

  await t.test('members cannot be added as ADMIN', async () => {
    const result = await addMember(organizationId, 'outsider@example.com', 'ADMIN', admin);

    assert.equal(result.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.equal(await Membership.countDocuments({ user: outsider.id }), 0);
  });

  await t.test('adding an unknown email returns NOT_FOUND', async () => {
    const result = await addMember(organizationId, 'nobody@example.com', 'DEVELOPER', admin);

    assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });
});
