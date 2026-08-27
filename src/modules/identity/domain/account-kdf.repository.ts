import type { KdfParams } from './kdf-params.js';
import type { Login } from './login.js';

export abstract class AccountKdfRepository {
  abstract findByLogin(login: Login): Promise<KdfParams | null>;
}
