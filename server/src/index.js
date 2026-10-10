import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { typeDefs } from './graphql/schema/index.js';
import { resolvers } from './graphql/resolvers/index.js';
import { createContext } from './graphql/context.js';
import { connectDatabase, isDatabaseConnected } from './config/db.js';
import './models/User.js';
import './models/Organization.js';
import './models/Membership.js';
import './models/Project.js';
import './models/Issue.js';
import './models/Comment.js';
import './models/Label.js';
import './models/Activity.js';
import './models/Notification.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.example'),
});

const PORT = Number(process.env.PORT) || 3000;

try {
  await connectDatabase();
} catch {
  process.exit(1);
}

const app = express();

app.get('/health', (_req, res) => {
  const mongodbConnected = isDatabaseConnected();

  if (!mongodbConnected) {
    res.status(503).json({
      status: 'unhealthy',
      mongodb: 'disconnected',
    });
    return;
  }

  res.json({
    status: 'ok',
    mongodb: 'connected',
  });
});
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
});

  await apolloServer.start();
  
  

app.use(
  '/graphql',
  express.json(),
  expressMiddleware(apolloServer, { context: createContext }),
);

app.listen(PORT, () => {
  console.log(`DevHub server listening on http://localhost:${PORT}`);
});
