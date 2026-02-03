import { describe, it, expect } from 'vitest';
import {
  parseProcNetTcp,
  parseProcFdListing,
  parseProcessNames,
} from '../services/port-detection.service.js';

describe('port-detection.service', () => {
  describe('parseProcNetTcp', () => {
    it('should parse listening ports from /proc/net/tcp', () => {
      const content = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345
   1: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12346
   2: 0100007F:0035 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12347`;

      const result = parseProcNetTcp(content);

      expect(result).toEqual([
        { port: 3000, inode: 12345 }, // 0BB8 = 3000
        { port: 8080, inode: 12346 }, // 1F90 = 8080
        { port: 53, inode: 12347 }, // 0035 = 53
      ]);
    });

    it('should ignore non-LISTEN connections', () => {
      const content = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345
   1: 0100007F:D2A0 0100007F:0BB8 01 00000000:00000000 00:00000000 00000000  1000        0 12348`;

      const result = parseProcNetTcp(content);

      // Only LISTEN (0A) should be included, not ESTABLISHED (01)
      expect(result).toEqual([{ port: 3000, inode: 12345 }]);
    });

    it('should handle empty content', () => {
      const result = parseProcNetTcp('');
      expect(result).toEqual([]);
    });

    it('should skip header line', () => {
      const content = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode`;
      const result = parseProcNetTcp(content);
      expect(result).toEqual([]);
    });

    it('should handle IPv6 addresses in /proc/net/tcp6', () => {
      const content = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000000000000:1F90 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 54321`;

      const result = parseProcNetTcp(content);

      expect(result).toEqual([{ port: 8080, inode: 54321 }]);
    });

    it('should handle malformed lines gracefully', () => {
      const content = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345
   malformed line
   1: invalid_format`;

      const result = parseProcNetTcp(content);

      // Should only parse the valid line
      expect(result).toEqual([{ port: 3000, inode: 12345 }]);
    });
  });

  describe('parseProcFdListing', () => {
    it('should map socket inodes to PIDs', () => {
      const content = `lrwx------ 1 user user 64 Jan  1 00:00 /proc/123/fd/4 -> socket:[12345]
lrwx------ 1 user user 64 Jan  1 00:00 /proc/456/fd/5 -> socket:[12346]
lrwx------ 1 user user 64 Jan  1 00:00 /proc/123/fd/6 -> pipe:[99999]`;

      const result = parseProcFdListing(content);

      expect(result.get(12345)).toBe(123);
      expect(result.get(12346)).toBe(456);
      expect(result.has(99999)).toBe(false); // pipe is not a socket
    });

    it('should handle empty content', () => {
      const result = parseProcFdListing('');
      expect(result.size).toBe(0);
    });

    it('should handle various socket formats', () => {
      const content = `lrwx------ 1 user user 64 Jan  1 00:00 /proc/1/fd/0 -> socket:[1]
lrwx------ 1 user user 64 Jan  1 00:00 /proc/9999/fd/999 -> socket:[999999999]`;

      const result = parseProcFdListing(content);

      expect(result.get(1)).toBe(1);
      expect(result.get(999999999)).toBe(9999);
    });
  });

  describe('parseProcessNames', () => {
    it('should parse pid:name pairs', () => {
      const content = `123:node
456:python
789:nginx`;

      const result = parseProcessNames(content);

      expect(result.get(123)).toBe('node');
      expect(result.get(456)).toBe('python');
      expect(result.get(789)).toBe('nginx');
    });

    it('should handle empty content', () => {
      const result = parseProcessNames('');
      expect(result.size).toBe(0);
    });

    it('should handle process names with special characters', () => {
      const content = `123:node-server
456:python3.10
789:my_app`;

      const result = parseProcessNames(content);

      expect(result.get(123)).toBe('node-server');
      expect(result.get(456)).toBe('python3.10');
      expect(result.get(789)).toBe('my_app');
    });

    it('should handle malformed lines gracefully', () => {
      const content = `123:node
invalid
456`;

      const result = parseProcessNames(content);

      expect(result.get(123)).toBe('node');
      expect(result.size).toBe(1);
    });

    it('should trim whitespace', () => {
      const content = `  123:node
  456:python  `;

      const result = parseProcessNames(content);

      expect(result.get(123)).toBe('node');
      expect(result.get(456)).toBe('python');
    });
  });
});
