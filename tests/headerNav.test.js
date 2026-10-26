import { describe, it, expect } from 'vitest';
import { formatActiveStudentName } from '../src/components/HeaderNav.jsx';

describe('HeaderNav: Deterministic Name Parser Suite', () => {
  it('preserves anonymous student tokens ("Student ####") without splitting or altering', () => {
    expect(formatActiveStudentName('Student 4821')).toBe('Student 4821');
    expect(formatActiveStudentName('Student 1000')).toBe('Student 1000');
    expect(formatActiveStudentName('Student 9999')).toBe('Student 9999');
    expect(formatActiveStudentName('student 5432')).toBe('student 5432');
  });

  it('correctly parses "Last, First Middle" into "First LastInitial."', () => {
    expect(formatActiveStudentName('Paz, Brandon A')).toBe('Brandon P.');
    expect(formatActiveStudentName('Smith, John David')).toBe('John S.');
    expect(formatActiveStudentName('Rodriguez, Maria Elena')).toBe('Maria R.');
  });

  it('correctly parses "Last, First" into "First LastInitial."', () => {
    expect(formatActiveStudentName('Paz, Brandon')).toBe('Brandon P.');
    expect(formatActiveStudentName('Doe, Jane')).toBe('Jane D.');
  });

  it('correctly parses "First Middle Last" into "First LastInitial."', () => {
    expect(formatActiveStudentName('Brandon A Paz')).toBe('Brandon P.');
    expect(formatActiveStudentName('John David Smith')).toBe('John S.');
  });

  it('correctly parses "First Last" into "First LastInitial."', () => {
    expect(formatActiveStudentName('Brandon Paz')).toBe('Brandon P.');
    expect(formatActiveStudentName('Jane Doe')).toBe('Jane D.');
  });

  it('enforces length guard by truncating names > 15 characters with an ellipsis', () => {
    const longName = 'Bartholomew-Alexander P.';
    expect(longName.length).toBeGreaterThan(15);
    const result = formatActiveStudentName(longName);
    expect(result).toBe('Bartholomew-Ale…');
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(16); // 15 characters + '…'
  });

  it('handles edge cases gracefully (single name, empty, null, undefined)', () => {
    expect(formatActiveStudentName('')).toBe('');
    expect(formatActiveStudentName(null)).toBe('');
    expect(formatActiveStudentName(undefined)).toBe('');
    expect(formatActiveStudentName('Madonna')).toBe('Madonna');
  });
});
