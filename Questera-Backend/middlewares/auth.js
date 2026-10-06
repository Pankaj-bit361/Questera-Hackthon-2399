const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Who is calling comes from the login token only. Every /api route except the few public ones in index.js requires
// one, the request's userId (body, query or :userId) must be the caller's, and records named by their own id
// (:postId, :taskId, ...) must belong to the caller - see ownedParam.

const verify = (req) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return { error: 'No token provided' };
    try {
        const user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        if (!user?.userId) return { error: 'Invalid token' };
        return { user };
    } catch (error) {
        return { error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' };
    }
};

/** Token check only (sets req.user). */
const authMiddleware = (req, res, next) => {
    const { user, error } = verify(req);
    if (error) return res.status(401).json({ error });
    req.user = user;
    next();
};

const isSelf = (req, id) => id != null && (String(id) === req.user.userId || String(id) === String(req.user.id));

/**
 * Token check plus identity binding: a userId the request names must be the caller's, and a body without one gets
 * the caller's, so controllers that read req.body.userId act for the caller only.
 */
const requireUser = (req, res, next) => {
    authMiddleware(req, res, () => {
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
        for (const id of [body?.userId, req.query?.userId]) {
            if (id != null && id !== '' && !isSelf(req, id)) return res.status(403).json({ error: 'Account access denied' });
        }
        if (body) body.userId = req.user.userId;
        next();
    });
};

const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const isAdmin = (req) => !!req.user?.email && adminEmails().includes(String(req.user.email).toLowerCase());

/** Only the emails in ADMIN_EMAILS. */
const requireAdmin = (req, res, next) => {
    const go = () => (isAdmin(req) ? next() : res.status(403).json({ error: 'Admins only' }));
    return req.user ? go() : authMiddleware(req, res, go);
};

/** router.param handler: :userId must be the caller. */
const selfParam = (req, res, next, id) => (isSelf(req, id) ? next() : res.status(403).json({ error: 'Account access denied' }));

/**
 * router.param handler: the record `Model.findOne({[field]: id})` must exist and belong to the caller; otherwise 404,
 * so ids of other people's records look the same as ids that do not exist. `fallback(id, userId)` decides for
 * records saved without a userId.
 */
const ownedParam = (Model, field, fallback) => async (req, res, next, id) => {
    try {
        const doc = await Model.findOne({ [field]: id }).select('userId').lean();
        const ok = doc && (doc.userId ? isSelf(req, doc.userId) : fallback ? await fallback(id, req.user.userId) : false);
        return ok ? next() : res.status(404).json({ error: 'Not found' });
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware: ids in the body that name existing records (a chat to continue, ...) must be the caller's. An id with
 * no record is allowed; the controller creates it for the caller.
 */
const ownedBodyIds = (fields) => async (req, res, next) => {
    try {
        for (const [field, Model] of Object.entries(fields)) {
            const id = req.body?.[field];
            if (id == null || id === '') continue;
            const doc = await Model.findOne({ [field]: String(id) }).select('userId').lean();
            if (doc?.userId && !isSelf(req, doc.userId)) return res.status(404).json({ error: 'Not found' });
        }
        next();
    } catch (error) {
        next(error);
    }
};

/** For service-to-service callers: header X-Service-Key must equal process.env[envName] (compared in constant time). */
const hasServiceKey = (req, envName) => {
    const want = process.env[envName];
    const got = req.headers['x-service-key'];
    if (!want || typeof got !== 'string') return false;
    const a = crypto.createHash('sha256').update(want).digest();
    const b = crypto.createHash('sha256').update(got).digest();
    return crypto.timingSafeEqual(a, b);
};

module.exports = authMiddleware;
Object.assign(module.exports, {
    authMiddleware,
    requireUser,
    requireAdmin,
    isAdmin,
    selfParam,
    ownedParam,
    ownedBodyIds,
    hasServiceKey,
});
