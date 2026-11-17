import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'*.spec.js',fullyParallel:false,workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:4193',trace:'retain-on-failure'},
 webServer:{command:'npm run build && npm run preview -- --port 4193 --strictPort',url:'http://127.0.0.1:4193/podlingua/',reuseExistingServer:false,timeout:120000},
});
