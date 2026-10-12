import jwt from 'jsonwebtoken';

//this file is used to create the context for each GraphQL request, including extracting and verifying the user ID from the JWT token.
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function createContext({ req } = {}) {
  //authorization header conatains the JWT token in the format "Bearer <token>"
  
  const authorization = req?.headers?.authorization;
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;

  if (!match || !process.env.JWT_SECRET) {
    return { userId: null };
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    return {
      //userId is extracted and can be used with syntax context.userId in your resolvers.
      userId: typeof payload === 'object' && typeof payload.sub === 'string' && OBJECT_ID_PATTERN.test(payload.sub)
        ? payload.sub //payload.sub contains the user ID extracted from the JWT token in line number 16
        : null,
    };
  } catch {
    return { userId: null };
  }
}