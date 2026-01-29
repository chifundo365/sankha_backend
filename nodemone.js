#!/usr/bin/env node
const nodemon = require('nodemon');

nodemon({
  script: 'npm',
  args: ['run', 'dev'],
  watch: ['src', '.env'],
  ext: 'ts,js,json',
  ignore: ['dist', 'node_modules']
});

nodemon
  .on('start', () => console.log('Nodemon started (nodemone.js)'))
  .on('restart', files => console.log('Nodemon restarted due to:', files))
  .on('quit', () => { console.log('Nodemon quit'); process.exit(); });
