import jwt from 'jsonwebtoken';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function createContext({ req } = {}) {
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
      userId: typeof payload === 'object' && typeof payload.sub === 'string' && OBJECT_ID_PATTERN.test(payload.sub)
        ? payload.sub
        : null,
    };
  } catch {
    return { userId: null };
  }
}