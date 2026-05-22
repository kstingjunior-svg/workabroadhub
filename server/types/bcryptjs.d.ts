// Defensive shim in case any code path imports bcryptjs.
// The standard path is bcrypt (which has @types installed).
declare module "bcryptjs";
