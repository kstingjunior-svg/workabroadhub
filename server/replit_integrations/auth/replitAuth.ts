import express from 'express';
export function setupAuth(app: express.Application) {
  app.use((req, res, next) => {
    if (!req.session) req.session = {} as any;
    if (!req.session.user) {
      req.session.user = { id: 'dev-user', email: 'dev@local.com', isAdmin: true };
    }
    next();
  });
}
