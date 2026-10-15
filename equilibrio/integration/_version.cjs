'use strict';
// Historical suites introduced at 0.39.N remain enabled after the minor changes.
function revision(value=require('../package.json').version) {
  const [major,minor,patch]=String(value).split('.').map(Number);
  return major>0||minor>39?Infinity:minor===39?patch:-1;
}
module.exports={revision};
