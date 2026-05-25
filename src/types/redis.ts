export interface RedisKeyInfo {
  key: string;
  keyType: string;
  ttl: number;
  size?: number | null;
}

export interface RedisKeyValue extends RedisKeyInfo {
  value: unknown;
}
