# Wallet 模块

## 数据结构

### wallet

|name|type|note|
|----|----|----|
|balance|float|账户余额|
|frozen|float|冻结总额|
|withdrawal|float|可提现总额|

### wallet-log

|name|type|note|
|----|----|----|
|title|string|钱包日志内容|
|occurred-at|iso8601|发生时间|
|amount|float|金额(正为收入，负为支出)|

## 接口

### 获得钱包信息 getWallet

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript

var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("wallet", "getWallet", uid)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

|name|type|note|
|----|----|----|
|wallet|wallet|Wallet Information|

See [exampel](../data/wallet/getWallet.json)

### 获得钱包日志列表 getWalletLogs

钱包日志按时间逆序显示。

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|
|offset|int|结果在数据集中的起始位置|
|limit|int|显示结果的长度|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("wallet", "getWalletLogs", uid, 0, 10)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

|name|type|note|
|----|----|----|
|logs|[wallet-log]|Wallet Log|

See [example](../data/wallet/getWalletLogs.json)
