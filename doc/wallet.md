# Wallet 模块

## 修改记录

1. 2016-09-23
  * 调整数据结构
  * 删除 getAccounts 接口。

## 数据结构

### wallet

| name     | type      | note     |
| ----     | ----      | ----     |
| balance  | float     | 账户余额 |
| accounts | [account] | 帐号     |

### account

| name         | type          | note            |
| ----         | ----          | ----            |
| id           | uuid          | 帐号 ID         |
| type         | integer       | 帐号类型        |
| vid          | uuid          | 帐号对应车辆 ID |
| balance0     | float         | 余额0           |
| balance1     | float         | 余额1           |

帐号类型

| code | name     | balance0 | balance1 |
| ---  | ---      | ---      | ---      |
| 0    | 普通类型 | 帐号余额 | 无效     |
| 1    | 池类型   | 小池余额 | 大池余额 |

### Transaction

| name        | type    | note                     |
| ----        | ----    | ----                     |
| id          | uuid    | 交易日志 ID              |
| aid         | uuid    | 帐号 ID                  |
| type        | integer | 交易类型                 |
| title       | string  | 钱包日志内容             |
| occurred-at | iso8601 | 发生时间                 |
| amount      | float   | 金额(正为收入，负为支出) |

交易类型

| code | name           |
| ---- | ----           |
| 1    | 普通帐号充值   |
| 2    | 池帐号小池充值 |
| 3    | 池帐号大池充值 |
| -1   | 普通帐号扣款   |
| -2   | 池帐号小池扣款 |
| -3   | 池帐号大池扣款 |

## 数据库结构

### wallets

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |
| deleted     | boolean   |      | false   |         |           |

wallets.id == user.id

### accounts

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| wid         | uuid      |      |         |         | wallets   |
| type        | smallint  |      |         |         |           |
| vid         | uuid      | ✓    |         |         | vehicles  |
| balance0    | float     |      |         |         |           |
| balance1    | float     |      |         |         |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |
| deleted     | boolean   |      | false   |         |           |

### transactions

| field        | type      | null | default | index   | reference |
| ----         | ----      | ---- | ----    | ----    | ----      |
| id           | uuid      |      |         | primary |           |
| aid          | uuid      |      |         |         | accounts  |
| type         | smallint  |      |         |         |           |
| title        | char(128) |      |         |         |           |
| amount       | float     |      |         |         |           |
| occurred\_at | timestamp |      | now     |         |           |

## 接口

### 获得钱包信息 getWallet

钱包的数据其实是各个帐号数据的汇总。

#### request

| name | type | note    |
| ---- | ---- | ----    |
| uid  | uuid | 用户 ID |

##### example

```javascript

var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("wallet", "getWallet", uid)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name   | type   | note               |
| ----   | ----   | ----               |
| wallet | wallet | Wallet Information |

注意: 帐号对应 balance0，balance1 的含义请参考前文的数据结构。

See [example](../data/wallet/getWallet.json)

### 获得钱包交易日志列表 getTransactions

钱包交易日志按时间逆序显示。

#### request

| name   | type | note                     |
| ----   | ---- | ----                     |
| uid    | uuid | 用户 ID                  |
| offset | int  | 结果在数据集中的起始位置 |
| limit  | int  | 显示结果的长度           |

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("wallet", "getTransactions", uid, 0, 10)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name         | type          | note        |
| ----         | ----          | ----        |
| transactions | [transaction] | Transaction |

See [example](../data/wallet/getTransactions.json)
