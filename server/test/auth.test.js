import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { User } from '../src/models/User.js';
import { createContext } from '../src/graphql/context.js';
import { resolvers } from '../src/graphql/resolvers/index.js';
import { typeDefs } from '../src/graphql/schema/index.js';

process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters';

const server = new ApolloServer({ typeDefs, resolvers });
const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/devhub_auth_test';
const password = 'correct-horse-battery';
let registeredUser;
let loginToken;

before(async () => {
  await mongoose.connect(mongoUri);
  await User.init();
  await User.deleteMany({});
  await server.start();
});

after(async () => {
  await User.deleteMany({});
  await server.stop();
  await mongoose.disconnect();
});

async function execute(query, contextValue = {}) {
  const result = await server.executeOperation({ query }, { contextValue });
  return result.body.singleResult;
}

test('authentication flow', async (t) => {
  await t.test('hello remains available', async () => {
    const result = await execute('{ hello }');
    assert.equal(result.data.hello, 'Hello from DevHub!');
  });

  await t.test('registration normalizes email and stores only a password hash', async () => {
    const result = await execute(`
      mutation {
        register(input: { name: " Test User ", email: " TEST@Example.com ", password: "${password}" }) {
          id name email
        }
      }
    `);

    assert.equal(result.errors, undefined);
    registeredUser = result.data.register;
    assert.equal(registeredUser.name, 'Test User');
    assert.equal(registeredUser.email, 'test@example.com');
    assert.equal('passwordHash' in registeredUser, false);

    const storedUser = await User.findById(registeredUser.id).select('+passwordHash');
    assert.ok(storedUser.passwordHash);
    assert.notEqual(storedUser.passwordHash, password);
    assert.equal(await bcrypt.compare(password, storedUser.passwordHash), true);
    assert.equal((await User.findById(registeredUser.id)).passwordHash, undefined);
  });

  await t.test('registration rejects missing or invalid required values', async () => {
    const result = await execute(`
      mutation {
        register(input: { name: " ", email: "not-an-email", password: "short" }) {
          id
        }
      }
    `);

    assert.equal(result.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
  });

  await t.test('duplicate email is rejected cleanly after normalization', async () => {
    const result = await execute(`
      mutation {
        register(input: { name: "Other User", email: "TEST@example.COM", password: "${password}" }) {
          id
        }
      }
    `);

    assert.equal(result.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT');
    assert.match(result.errors[0].message, /already exists/i);
  });

  await t.test('login returns a signed token and public user', async () => {
    const result = await execute(`
      mutation {
        login(input: { email: " TEST@example.com ", password: "${password}" }) {
          token
          user { id name email }
        }
      }
    `);

    assert.equal(result.errors, undefined);
    loginToken = result.data.login.token;
    assert.equal(result.data.login.user.id, registeredUser.id);
    assert.equal('passwordHash' in result.data.login.user, false);
    assert.equal(jwt.verify(loginToken, process.env.JWT_SECRET).sub, registeredUser.id);
  });

  await t.test('invalid credentials use a generic authentication error', async () => {
    const result = await execute(`
      mutation {
        login(input: { email: "test@example.com", password: "wrong-password" }) {
          token
        }
      }
    `);

    assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
    assert.equal(result.errors[0].message, 'Invalid email or password.');
  });

  await t.test('context accepts valid JWTs and ignores invalid JWTs', async () => {
    const validContext = createContext({
      req: { headers: { authorization: `Bearer ${loginToken}` } },
    });
    const invalidContext = createContext({
      req: { headers: { authorization: 'Bearer invalid-token' } },
    });

    assert.equal(validContext.userId, registeredUser.id);
    assert.equal(invalidContext.userId, null);
  });

  await t.test('currentUser returns the JWT user and null without valid authentication', async () => {
    const authorized = await execute('{ currentUser { id email } }', createContext({
      req: { headers: { authorization: `Bearer ${loginToken}` } },
    }));
    const unauthorized = await execute('{ currentUser { id } }', createContext({
      req: { headers: { authorization: 'Bearer invalid-token' } },
    }));

    assert.equal(authorized.data.currentUser.id, registeredUser.id);
    assert.equal(authorized.data.currentUser.email, registeredUser.email);
    assert.equal(unauthorized.data.currentUser, null);
  });
});