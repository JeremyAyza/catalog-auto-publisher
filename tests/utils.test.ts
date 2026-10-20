import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLatestDataset, getTimestamp, resolveDatasetPath } from '../utils';

describe('getTimestamp', () => {
	it('returns YYYY_MM_DD_HH_MM_SS', () => {
		expect(getTimestamp()).toMatch(/^\d{4}(_\d{2}){5}$/);
	});
});

describe('dataset resolution', () => {
	let dir: string;
	let cwd: string;

	beforeEach(() => {
		cwd = process.cwd();
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
		fs.ensureDirSync(path.join(dir, 'datasets'));
		process.chdir(dir);
		delete process.env.DATASET_FILE;
	});

	afterEach(() => {
		process.chdir(cwd);
		fs.removeSync(dir);
		delete process.env.DATASET_FILE;
	});

	function write(name: string, mtime: number) {
		const file = path.join(dir, 'datasets', name);
		fs.writeJsonSync(file, []);
		fs.utimesSync(file, mtime, mtime);
	}

	it('picks the most recently modified dataset', () => {
		write('old.json', 1_000);
		write('new.json', 2_000);
		expect(getLatestDataset('datasets')).toBe(path.join('datasets', 'new.json'));
	});

	it('returns null when there is no datasets folder', () => {
		expect(getLatestDataset('missing')).toBeNull();
	});

	it('prefers DATASET_FILE over the CLI argument', () => {
		write('a.json', 1_000);
		write('b.json', 1_000);
		process.env.DATASET_FILE = 'a.json';
		expect(resolveDatasetPath('b')).toBe(path.join(dir, 'datasets', 'a.json'));
	});

	it('adds .json to the CLI argument when missing', () => {
		write('b.json', 1_000);
		expect(resolveDatasetPath('b')).toBe(path.join(dir, 'datasets', 'b.json'));
	});

	it('throws when the dataset does not exist', () => {
		expect(() => resolveDatasetPath('nope')).toThrow('Dataset not found');
	});
});
