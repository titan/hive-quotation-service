# Wallet 模块

## 数据结构

### wallet

|name|type|note|
|----|----|----|
|balance|float|账户余额|

### account

|name|type|note|
|----|----|----|
|id|uuid|帐号 ID|
|type|integer|帐号类型|
|vid|uuid|帐号对应车辆 ID|
|balance0|float|余额0|
|balance1|float|余额1|

帐号类型

|code|name|balance0|balance1|
|---|---|---|---|
|0|普通类型|帐号余额|无效|
|1|蜂巢类型|小蜂巢余额|大蜂巢余额|

### Transaction

|name|type|note|
|----|----|----|
|id|uuid|交易日志 ID|
|aid|uuid|帐号 ID|
|type|integer|交易类型|
|title|string|钱包日志内容|
|occurred-at|iso8601|发生时间|
|amount|float|金额(正为收入，负为支出)|

交易类型

|code|name|
|----|----|
|1|普通帐号充值|
|2|蜂巢帐号小蜂巢充值|
|3|蜂巢帐号大蜂巢充值|
|-1|普通帐号扣款|
|-2|蜂巢帐号小蜂巢扣款|
|-3|蜂巢帐号大蜂巢扣款|

## 接口

### 获得钱包信息 getWallet

钱包的数据其实是各个帐号数据的汇总。

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

See [example](../data/wallet/getWallet.json)

### 获得帐号列表 getAccounts

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript

var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("wallet", "getAccounts", uid)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

|name|type|note|
|----|----|----|
|accounts|[account]|Account|

See [example](../data/wallet/getAccounts.json)


### 获得钱包交易日志列表 getTransactions

钱包交易日志按时间逆序显示。

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|
|offset|int|结果在数据集中的起始位置|
|limit|int|显示结果的长度|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("wallet", "getTransactions", uid, 0, 10)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

|name|type|note|
|----|----|----|
|transactions|[transaction]|Transaction|

See [example](../data/wallet/getTransactions.json)
