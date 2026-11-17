import {defineConfig} from 'vitest/config';
export default defineConfig({test:{maxWorkers:2,include:['tests/unit/**/*.test.{ts,mjs}']}});
