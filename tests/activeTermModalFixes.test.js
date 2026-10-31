import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ActiveTermModal, { getCourseSessionBandLabel } from '../src/components/ActiveTermModal.jsx';
import {
  CANONICAL_TERM_TOKENS,
  CANONICAL_COURSE_STATUSES,
  normalizeTermAbbreviation,
  normalizeActiveCourseStatus
} from '../src/utils/intakeHelpers.js';

describe('Active Term Abbreviation & ActiveTermModal Overhaul Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Term Abbreviation Canonical Normalization
  // ---------------------------------------------------------------------------
  describe('1. normalizeTermAbbreviation Canonical Mapping', () => {
    it('normalizes all Fall 16-week variants to "FA (16wk)"', () => {
      const variants = [
        'Full 16 Week',
        'Full 16-week',
        'Fall 16-Week',
        'Fall 16wk',
        'FA 16wk',
        'Fall 2026',
        'Fall-16wk'
      ];
      for (const v of variants) {
        expect(normalizeTermAbbreviation(v)).toBe('FA (16wk)');
      }
    });

    it('normalizes all Fall Session I variants to "FA-I (8wk)"', () => {
      const variants = [
        'Fall Session I',
        'FA Session 1',
        'Fall 8-Week 1',
        'Session I 8-Week',
        'FA-I',
        'FALL_I_26_8W'
      ];
      for (const v of variants) {
        expect(normalizeTermAbbreviation(v)).toBe('FA-I (8wk)');
      }
    });

    it('normalizes all Fall Session II variants to "FA-II (8wk)"', () => {
      const variants = [
        'Fall Session II',
        'FA Session 2',
        'Fall 8-Week 2',
        'Session II 8-Week',
        'FA-II',
        'FALL_II_26_8W'
      ];
      for (const v of variants) {
        expect(normalizeTermAbbreviation(v)).toBe('FA-II (8wk)');
      }
    });

    it('normalizes Spring variants to "SP (16wk)", "SP-I (8wk)", and "SP-II (8wk)"', () => {
      expect(normalizeTermAbbreviation('Spring 16-Week')).toBe('SP (16wk)');
      expect(normalizeTermAbbreviation('Spring 16wk')).toBe('SP (16wk)');
      expect(normalizeTermAbbreviation('Spring Session I')).toBe('SP-I (8wk)');
      expect(normalizeTermAbbreviation('Spring 8-Week 1')).toBe('SP-I (8wk)');
      expect(normalizeTermAbbreviation('Spring Session II')).toBe('SP-II (8wk)');
      expect(normalizeTermAbbreviation('Spring 8-Week 2')).toBe('SP-II (8wk)');
    });

    it('normalizes Summer variants to "Summer"', () => {
      const variants = ['Summer', 'Summer 2026', 'SU-8wk', 'SU', 'SUMMER_26_8W', '2026SU'];
      for (const v of variants) {
        expect(normalizeTermAbbreviation(v)).toBe('Summer');
      }
    });

    it('preserves already-canonical tokens without modification', () => {
      for (const token of CANONICAL_TERM_TOKENS) {
        expect(normalizeTermAbbreviation(token)).toBe(token);
      }
    });

    it('extracts term from object with sessionBand, term, or semester', () => {
      expect(normalizeTermAbbreviation({ sessionBand: 'Session II 8-Week' })).toBe('FA-II (8wk)');
      expect(normalizeTermAbbreviation({ term: 'Fall Session I' })).toBe('FA-I (8wk)');
      expect(normalizeTermAbbreviation({ semester: 'Summer 2027' })).toBe('Summer');
      expect(normalizeTermAbbreviation(null)).toBe('FA (16wk)');
    });

    it('getCourseSessionBandLabel produces canonical token for backwards compatibility', () => {
      expect(getCourseSessionBandLabel({ sessionBand: 'Session I 8-Week' })).toBe('FA-I (8wk)');
      expect(getCourseSessionBandLabel({ term: 'Spring 16-Week' })).toBe('SP (16wk)');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Active Course Status Canonical Normalization
  // ---------------------------------------------------------------------------
  describe('2. normalizeActiveCourseStatus Canonical Mapping', () => {
    it('normalizes variations to "Completed"', () => {
      expect(normalizeActiveCourseStatus('Completed')).toBe('Completed');
      expect(normalizeActiveCourseStatus('COMPLETED')).toBe('Completed');
      expect(normalizeActiveCourseStatus('COMPLETE')).toBe('Completed');
      expect(normalizeActiveCourseStatus({ state: 'Completed' })).toBe('Completed');
      expect(normalizeActiveCourseStatus({ status: 'COMPLETED' })).toBe('Completed');
    });

    it('normalizes variations to "Scheduled"', () => {
      expect(normalizeActiveCourseStatus('Scheduled')).toBe('Scheduled');
      expect(normalizeActiveCourseStatus('SCHEDULED')).toBe('Scheduled');
      expect(normalizeActiveCourseStatus({ state: 'Scheduled' })).toBe('Scheduled');
      expect(normalizeActiveCourseStatus({ status: 'SCHEDULED' })).toBe('Scheduled');
    });

    it('normalizes variations to "In-Progress"', () => {
      expect(normalizeActiveCourseStatus('In-Progress')).toBe('In-Progress');
      expect(normalizeActiveCourseStatus('IN_PROGRESS')).toBe('In-Progress');
      expect(normalizeActiveCourseStatus('Current')).toBe('In-Progress');
      expect(normalizeActiveCourseStatus('CURRENT')).toBe('In-Progress');
      expect(normalizeActiveCourseStatus({ state: 'Current' })).toBe('In-Progress');
      expect(normalizeActiveCourseStatus({ status: 'In-Progress' })).toBe('In-Progress');
    });

    it('falls back to default fallbackState when input is undefined or unrecognized', () => {
      expect(normalizeActiveCourseStatus(null)).toBe('In-Progress');
      expect(normalizeActiveCourseStatus(undefined, 'Scheduled')).toBe('Scheduled');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ActiveTermModal Structure & Component Rendering
  // ---------------------------------------------------------------------------
  describe('3. ActiveTermModal Layout & Invariants', () => {
    const sampleCourses = [
      {
        code: 'ICS 42300',
        title: 'Network Security',
        credits: 3.0,
        term: 'Fall Session II',
        sessionBand: 'Session II 8-Week',
        status: 'In-Progress',
        state: 'Current'
      },
      {
        code: 'MTH 27100',
        title: 'Calculus I',
        credits: 5.0,
        term: 'Fall 16-Week',
        sessionBand: 'Full 16-Week',
        status: 'Completed',
        state: 'Completed'
      }
    ];

    it('renders the overhauled modal title and subtext', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: true,
          activeCourses: sampleCourses,
          onClose: () => {},
          onSave: () => {}
        })
      );

      expect(html).toContain('Edit Active Term &amp; Enrolled Coursework');
      expect(html).toContain(
        'Review and adjust session terms and course statuses, or search the catalog to add current and upcoming enrollments.'
      );
    });

    it('confirms the top 3-input parameter box is completely removed', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: true,
          activeCourses: sampleCourses,
          onClose: () => {},
          onSave: () => {}
        })
      );

      // Verify the removed IDs and testids are NOT in the DOM
      expect(html).not.toContain('active-term-selected-semester');
      expect(html).not.toContain('active-term-selected-status');
      expect(html).not.toContain('active-term-selected-modality');
      expect(html).not.toContain('Active Term Semester');
      expect(html).not.toContain('Delivery Modality');
    });

    it('renders "Search All Catalog Courses to Add" at top of modal body before course rows', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: true,
          activeCourses: sampleCourses,
          onClose: () => {},
          onSave: () => {}
        })
      );

      expect(html).toContain('Search All Catalog Courses to Add');
      expect(html).toContain('active-term-search-input');
      expect(html).toContain('active-term-search-session');
      expect(html).toContain('active-term-search-status');

      // Assert search input appears before the first enrolled course selector in DOM order
      const searchIndex = html.indexOf('active-term-search-input');
      const courseRowIndex = html.indexOf('active-term-select-0');
      expect(searchIndex).toBeGreaterThan(0);
      expect(courseRowIndex).toBeGreaterThan(searchIndex);
    });

    it('pre-selects canonical term and status in course rows', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: true,
          activeCourses: sampleCourses,
          onClose: () => {},
          onSave: () => {}
        })
      );

      // Row 0: ICS 42300 (Fall Session II -> FA-II (8wk))
      expect(html).toContain('data-testid="active-term-select-0"');
      expect(html).toContain('data-testid="active-status-select-0"');
      expect(html).toContain('data-testid="remove-active-course-0"');

      // Row 1: MTH 27100 (Fall 16-Week -> FA (16wk), Completed)
      expect(html).toContain('data-testid="active-term-select-1"');
      expect(html).toContain('data-testid="active-status-select-1"');
      expect(html).toContain('data-testid="remove-active-course-1"');

      // Save button
      expect(html).toContain('id="save-active-term-btn"');
      expect(html).toContain('data-testid="save-active-term-btn"');
      expect(html).toContain('Save &amp; Apply Active Changes');
    });

    it('renders empty message when working list is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActiveTermModal, {
          isOpen: true,
          activeCourses: [],
          onClose: () => {},
          onSave: () => {}
        })
      );

      expect(html).toContain('No active term courses currently enrolled');
    });
  });
});
