import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'*.spec.js',fullyParallel:false,workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
 webServer:{command:'npm run build && npm run preview',url:'http://127.0.0.1:4173/podlingua/',reuseExistingServer:true,timeout:120000},
});
