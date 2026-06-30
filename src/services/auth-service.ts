import { SupabaseClient, Session } from "@supabase/supabase-js";
import { BaseService } from "./base";
import { AuthenticationError } from "../errors";

export type AuthState = {
  session: Session | null;
  user: { id: string; email?: string } | null;
  loading: boolean;
};

export class AuthService extends BaseService {
  private readonly _client: SupabaseClient;

  constructor(client: SupabaseClient) {
    super("AuthService");
    this._client = client;
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this._client.auth.signUp({
      email,
      password,
    });
    if (error) throw new AuthenticationError(error.message);
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this._client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new AuthenticationError(error.message);
    return data;
  }

  async signOut() {
    const { error } = await this._client.auth.signOut();
    if (error) throw new AuthenticationError(error.message);
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this._client.auth.getSession();
    if (error) return null;
    return data.session;
  }

  onAuthStateChange(callback: (session: Session | null) => void) {
    return this._client.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
  }
}
