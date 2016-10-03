# Wallet 模块

## 修改记录

1. 2016-09-24
  * 增加 createAccount 接口。

1. 2016-09-23
  * 调整数据结构
  * 删除 getAccounts 接口。
  * 修改 getWallet 接口的参数。
  * 修改 getTransactions 接口的参数。
  * 修改 getWallet 返回的结果。
  * 修改 getTransactions 返回的结果。
  * 删除 wallet 表。
  * 增加缓存设计。

## 数据结构

### wallet

| name     | type      | note     |
| ----     | ----      | ----     |
| balance  | float     | 账户余额 |
| accounts | [account] | 帐号     |

### account

| name     | type    | note         |
| ----     | ----    | ----         |
| id       | uuid    | 帐号 ID      |
| type     | integer | 帐号类型     |
| vehicle  | vehicle | 帐号对应车辆 |
| balance0 | float   | 余额0        |
| balance1 | float   | 余额1        |

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

### accounts

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| uid         | uuid      |      |         |         | users     |
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

## 缓存结构


| key                 | type       | value                   | note         |
| ----                | ----       | ----                    | ----         |
| wallet-entities     | hash       | UID => Wallet           | 所有钱包实体 |
| transactions-${uid} | sorted set | {occurred, transaction} | 交易记录     |


## 接口

### 获得钱包信息 getWallet

钱包的数据其实是各个帐号数据的汇总。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name | type | note          |
| ---- | ---- | ----          |
| uid  | uuid | 仅 admin 有效 |

wallet 的 id 其实就是 user id

```javascript

rpc.call("wallet", "getWallet")
  .then(function (result) {

  }, function (error) {

  });

```

#### response

成功：

| name   | type   | note   |
| ----   | ----   | ----   |
| code   | int    | 200    |
| wallet | wallet | Wallet |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning   |
| ---- | ----       |
| 500  | 未知错误   |

注意: 帐号对应 balance0，balance1 的含义请参考前文的数据结构。

See [example](../data/wallet/getWallet.json)

### 创建钱包帐号 createAccount

创建钱包下的帐号。每个钱包下，每辆车只能有一个帐号，不能重复创建。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name     | type    | note          |
| ----     | ----    | ----          |
| type     | integer | 帐号类型      |
| balance0 | float   | 余额0         |
| balance1 | float   | 余额1         |
| vid      | uuid    | Vehicle ID    |
| uid      | uuid    | 仅 admin 有效 |

vid 在普通帐号类型下保持为 null。

```javascript
let type = 1;
let vid = "00000000-0000-0000-0000-000000000000";
let balance0 = 200.00;
let balance1 = 800.00;

rpc.call("wallet", "createAccount", type, balance0, balance1, vid)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

成功：

| name | type | note       |
| ---- | ---- | ----       |
| code | int  | 200        |
| aid  | uuid | Account ID |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning   |
| ---- | ----       |
| 404  | 车辆不存在 |
| 408  | 请求超时   |
| 409  | 帐号已存在 |
| 500  | 未知错误   |

注意: 帐号对应 balance0，balance1 的含义请参考前文的数据结构。

See [example](../data/wallet/createAccount.json)

### 获得钱包交易日志列表 getTransactions

钱包交易日志按时间逆序显示。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name   | type | note                     |
| ----   | ---- | ----                     |
| offset | int  | 结果在数据集中的起始位置 |
| limit  | int  | 显示结果的长度           |
| uid    | uuid | 仅 admin 有效            |

```javascript

rpc.call("wallet", "getTransactions", 0, 10)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

成功：

| name         | type          | note        |
| ----         | ----          | ----        |
| code         | int           | 200         |
| transactions | [transaction] | Transaction |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning          |
| ---- | ----              |
| 500  | 未知错误          |

See [example](../data/wallet/getTransactions.json)
