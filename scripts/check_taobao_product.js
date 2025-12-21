const { checkProductExists } = require('./utils/taobao-check');

async function checkTaobaoProduct(productId) {
  return checkProductExists(productId);
}

module.exports = { checkTaobaoProduct };
