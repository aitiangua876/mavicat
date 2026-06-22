import { describe, it, expect } from 'vitest';
import { extractQueryParams, interpolateQueryParams } from '../../src/utils/queryParameters';

describe('queryParameters', () => {
  describe('extractQueryParams', () => {
    it('should extract simple parameters', () => {
      const sql = 'SELECT * FROM users WHERE id = :id AND name = :name';
      const params = extractQueryParams(sql);
      expect(params).toEqual(expect.arrayContaining(['id', 'name']));
      expect(params).toHaveLength(2);
    });

    it('should deduplicate parameters', () => {
      const sql = 'SELECT * FROM users WHERE id = :id OR parent_id = :id';
      const params = extractQueryParams(sql);
      expect(params).toEqual(['id']);
    });

    it('should ignore postgres casts (::)', () => {
      const sql = 'SELECT price::numeric FROM products WHERE id = :prod_id';
      const params = extractQueryParams(sql);
      expect(params).toEqual(['prod_id']);
    });

    it('should return empty array if no params', () => {
      const sql = 'SELECT * FROM users';
      expect(extractQueryParams(sql)).toEqual([]);
    });

    it('should handle underscores in param names', () => {
        const sql = 'SELECT * FROM t WHERE col = :my_custom_param_1';
        expect(extractQueryParams(sql)).toEqual(['my_custom_param_1']);
    });

    it('should ignore colons inside SQL strings and comments', () => {
      const sql = `
        -- perms: should not be a parameter
        INSERT INTO sys_menu (perms, remark)
        VALUES ('input:invoice_operation_task:list', '任务唯一键：部门+来源+发票+操作');
        /* source:type should not be a parameter */
        SELECT * FROM users WHERE id = :id;
      `;
      expect(extractQueryParams(sql)).toEqual(['id']);
    });

    it('should not treat migration permission strings as parameters', () => {
      const sql = `
        INSERT INTO \`sys_menu\` (\`perms\`)
        SELECT 'input:invoice_operation_task:list'
        WHERE NOT EXISTS (
          SELECT 1 FROM \`sys_menu\`
          WHERE \`perms\` = 'input:invoice_operation_task:query'
        );
      `;
      expect(extractQueryParams(sql)).toEqual([]);
    });
  });

  describe('interpolateQueryParams', () => {
    it('should replace parameters with values', () => {
      const sql = 'SELECT * FROM users WHERE id = :id';
      const result = interpolateQueryParams(sql, { id: '123' });
      expect(result).toBe('SELECT * FROM users WHERE id = 123');
    });

    it('should handle multiple occurrences', () => {
      const sql = 'SELECT * FROM users WHERE id = :id OR parent_id = :id';
      const result = interpolateQueryParams(sql, { id: '5' });
      expect(result).toBe('SELECT * FROM users WHERE id = 5 OR parent_id = 5');
    });

    it('should leave unknown params untouched', () => {
      const sql = 'SELECT * FROM users WHERE id = :id';
      const result = interpolateQueryParams(sql, {});
      expect(result).toBe('SELECT * FROM users WHERE id = :id');
    });

    it('should ignore postgres casts during replacement', () => {
        const sql = 'SELECT val::text FROM t WHERE id = :id';
        const result = interpolateQueryParams(sql, { id: '10' });
        expect(result).toBe('SELECT val::text FROM t WHERE id = 10');
    });

    it('should not replace parameter-like tokens inside SQL strings and comments', () => {
      const sql = `
        -- :id in a comment should stay untouched
        SELECT 'input:invoice_operation_task:list' AS perms, :id AS id;
      `;
      const result = interpolateQueryParams(sql, { id: '10', invoice_operation_task: 'broken' });
      expect(result).toContain("-- :id in a comment should stay untouched");
      expect(result).toContain("'input:invoice_operation_task:list'");
      expect(result).toContain("10 AS id");
    });
  });
});
