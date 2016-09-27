# bank-payment 模块

## 修改记录

1. 2016-09-26
  * 增加生成绑卡链接接口。
  * 增加生成登录链接接口。
  * 增加生成自动投标链接接口。
  * 增加生成余额查询链接接口。
  * 增加生成子账户查询链接接口。
  * 增加生成交易状态查询链接接口。
  * 增加生成充值对账链接接口。

1. 2016-09-25
  * 增加缓存设计。
  * 修改回调前端的 url。

1. 2016-09-24
  * 增加 getCustomerId 接口。

## 缓存结构

| key            | type | value            | note                        |
| ----           | ---- | ----             | ----                        |
| bank-customers | hash | openid => custid | openid 与 custid 的对应关系 |

注意：openid 只有 25 个字节长。

## 接口

### 生成开户链接 generateUserRegisterUrl

生成跳转到汇付天下的用户开户链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name   | type     | note               |
| ----   | ----     | ----               |
| openid | char(25) | Open ID 的有效部分 |
| name   | char(50) | 用户姓名           |
| id-no  | char(30) | 用户身份证号       |
| phone  | char(11) | 用户手机号         |
| test   | boolean  | 是否开启测试模式   |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | UserRegister     |
| MerCustId | 6000060004492053 |
| BgRetUrl  | 见下面           |
| RetUrl    | 见下面           |
| PageType  | 2                |
| ChkValue  | 签名             |

BgRetUrl:

| 场景 | 内容                                       |
| ---- | ----                                       |
| 正式 | http://m.fengchaohuzhu.com/bank/register   |
| 测试 | http://dev.fengchaohuzhu.com/bank/register |

RetUrl:

| 场景 | 内容                                               |
| ---- | ----                                               |
| 正式 | http://m.fengchaohuzhu.com/bank/RegisterCallback   |
| 测试 | http://dev.fengchaohuzhu.com/bank/RegisterCallback |

注意：

url 作为参数传递时，需要调用 encodeURIComponent 进行编码。

```javascript
let openid = "0000000000000000000000000";
let name = "丁一";
let idno = "010000194910010000";
let phone = "18800000000";

rpc.call("bank_payment", "generateUserRegisterUrl", openid, name, idno, phone)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateUserRegisterUrl.json)

### 生成充值链接 generateNetSaveUrl

生成跳转到汇付天下的用户充值链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name         | type     | note                  |
| ----         | ----     | ----                  |
| customer-id  | char(16) | 汇付天下生成的用户 ID |
| order-id     | char(30) | 订单编号              |
| order-date   | char(8)  | 订单日期 YYYYMMDD     |
| trans-amount | char(14) | 交易金额 ###.##       |
| test         | boolean  | 是否开启测试模式      |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | NetSave          |
| MerCustId | 6000060004492053 |
| BgRetUrl  | 见下面           |
| RetUrl    | 见下面           |
| PageType  | 2                |
| ChkValue  | 签名             |

BgRetUrl:

| 场景 | 内容                                      |
| ---- | ----                                      |
| 正式 | http://m.fengchaohuzhu.com/bank/netsave   |
| 测试 | http://dev.fengchaohuzhu.com/bank/netsave |

RetUrl:

| 场景 | 内容                                              |
| ---- | ----                                              |
| 正式 | http://m.fengchaohuzhu.com/bank/NetSaveCallback   |
| 测试 | http://dev.fengchaohuzhu.com/bank/NetSaveCallback |

url 作为参数传递时，需要调用 encodeURIComponent 进行编码。

```javascript
let customer_id = "0000000000000000";
let order_id = "000000000000000000000000000000";
let order_date = "20161001";
let trans_amount = "100.00";

rpc.call("bank_payment", "generateNetSaveUrl", customer_id, order_id, order_date, trans_amount)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateNetSaveUrl.json)

### 获得银行帐号 ID getCustomerId

获得已保存的银行帐号 ID 。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name | type | note          |
| ---- | ---- | ----          |
| uid  | uuid | 仅 admin 有效 |

```javascript

rpc.call("bank_payment", "getCustomerId")
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type     | note        |
| ---- | ----     | ----        |
| code | int      | 200         |
| cid  | char(16) | 银行帐号 ID |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning           |
| ---- | ----               |
| 404  | 银行帐号 ID 不存在 |
| 500  | 未知错误           |

See [example](../data/bank-payment/getCustomerId.json)

### 生成绑卡链接 generateUserBindCardUrl

生成跳转到汇付天下的用户绑卡链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name        | type     | note                  |
| ----        | ----     | ----                  |
| customer-id | char(16) | 汇付天下生成的用户 ID |
| test        | boolean  | 是否开启测试模式      |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | UserBindCard     |
| MerCustId | 6000060004492053 |
| BgRetUrl  | 见下面           |
| PageType  | 2                |
| ChkValue  | 签名             |

BgRetUrl:

| 场景 | 内容                                       |
| ---- | ----                                       |
| 正式 | http://m.fengchaohuzhu.com/bank/bindcard   |
| 测试 | http://dev.fengchaohuzhu.com/bank/bindcard |

url 作为参数传递时，需要调用 encodeURIComponent 进行编码。

```javascript
let customer_id = "0000000000000000";

rpc.call("bank_payment", "generateUserBindCardUrl", customer_id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateUserBindCardUrl.json)

### 生成用户登录链接 generateUserLoginUrl

生成跳转到汇付天下的用户登录链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name        | type     | note                  |
| ----        | ----     | ----                  |
| customer-id | char(16) | 汇付天下生成的用户 ID |
| test        | boolean  | 是否开启测试模式      |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | UserLogin        |
| MerCustId | 6000060004492053 |
| PageType  | 2                |
| ChkValue  | 签名             |

```javascript
let customer_id = "0000000000000000";

rpc.call("bank_payment", "generateUserLoginUrl", customer_id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateUserLoginUrl.json)

### 生成自动投标链接 generateAutoTenderUrl

生成跳转到汇付天下的自动投标链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name            | type     | note                    |
| ----            | ----     | ----                    |
| customer-id     | char(16) | 汇付天下生成的用户 ID   |
| order-id        | char(30) | 订单编号                |
| order-date      | char(8)  | 订单日期 YYYYMMDD       |
| trans-amount    | char(14) | 交易金额 ###.##         |
| max-tender-rate | char(6)  | 最大投资手续费率 ###.## |
| borrowers       | json     | 多个借款人信息          |
| test            | boolean  | 是否开启测试模式        |

其中，borrowers 是如下 JSON 对象的数组：

| name           | type     | note                |
| ----           | ----     | ----                |
| BorrowerCustId | char(16) | 借款人客户号        |
| BorrowerAmt    | char(12) | 借款金额 ###.##     |
| BorrowerRate   | char(6)  | 借款手续费率 ###.## |
| ProId          | char(16) | 项目 ID             |

生成链接时，borrowers 需要用 encodeURI 函数进行编码。

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | AutoTender       |
| MerCustId | 6000060004492053 |
| BgRetUrl  | 见下面           |
| RetUrl    | 见下面           |
| IsFreeze  | 'N'              |
| PageType  | 2                |
| ChkValue  | 签名             |

BgRetUrl:

| 场景 | 内容                                         |
| ---- | ----                                         |
| 正式 | http://m.fengchaohuzhu.com/bank/autotender   |
| 测试 | http://dev.fengchaohuzhu.com/bank/autotender |

RetUrl:

| 场景 | 内容                                              |
| ---- | ----                                              |
| 正式 | http://m.fengchaohuzhu.com/bank/AutoTenderCallback   |
| 测试 | http://dev.fengchaohuzhu.com/bank/AutoTenderCallback |

url 作为参数传递时，需要调用 encodeURIComponent 进行编码。

```javascript
let customer_id = "0000000000000000";
let order_id = "000000000000000000000000000000";
let order_date = "20161001";
let trans_amount = "100.00";
let max_tender_rate = "0.00";
let borrowers = [
  {
    BorrowerCustId: "0000000000000001",
    BorrowerAmt: "0.00",
    BorrowerRate: "0.00",
    ProId: "0000000000000001"
  },
  {
    BorrowerCustId: "0000000000000002",
    BorrowerAmt: "0.00",
    BorrowerRate: "0.00",
    ProId: "0000000000000002"
  }
];

rpc.call("bank_payment", "generateAutoTenderUrl", customer_id, order_id, order_date, trans_amount, max_tender_rate, borrowers)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateAutoTenderUrl.json)

### 生成余额查询链接(后台) generateQueryBalanceBgUrl

生成跳转到汇付天下的余额查询链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name        | type     | note                  |
| ----        | ----     | ----                  |
| customer-id | char(16) | 汇付天下生成的用户 ID |
| test        | boolean  | 是否开启测试模式      |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | QueryBalanceBg   |
| MerCustId | 6000060004492053 |
| ChkValue  | 签名             |

```javascript
let customer_id = "0000000000000000";

rpc.call("bank_payment", "generateQueryBalanceBgUrl", customer_id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateQueryBalanceBgUrl.json)

### 生成子账户查询链接(后台) generateQueryAcctsUrl

生成跳转到汇付天下的子账户查询链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name        | type     | note                  |
| ----        | ----     | ----                  |
| test        | boolean  | 是否开启测试模式      |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | QueryAccts       |
| MerCustId | 6000060004492053 |
| ChkValue  | 签名             |

```javascript

rpc.call("bank_payment", "generateQueryAcctsUrl")
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateQueryAcctsUrl.json)

### 生成交易状态查询链接 generateQueryTransStatUrl

生成跳转到汇付天下的用户充值链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name             | type     | note              |
| ----             | ----     | ----              |
| order-id         | char(30) | 订单编号          |
| order-date       | char(8)  | 订单日期 YYYYMMDD |
| query-trans-type | string   |                   |
| test             | boolean  | 是否开启测试模式  |

query-trans-type 取值如下：

| name      | meaning          |
| ----      | ----             |
| LOANS     | 放款交易查询     |
| REPAYMENT | 还款交易查询     |
| TENDER    | 投标交易查询     |
| CASH      | 取现交易查询     |
| FREEZE    | 冻结解冻交易查询 |


默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value            |
| ----      | ----             |
| Version   | 10               |
| CmdId     | QueryTransStat   |
| MerCustId | 6000060004492053 |
| ChkValue  | 签名             |

```javascript
let order_id = "000000000000000000000000000000";
let order_date = "20161001";
let query_trans_type = "LOANS";

rpc.call("bank_payment", "generateQueryTransStatUrl", order_id, order_date, query_trans_type)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateQueryTransStatUrl.json)

### 生成充值对账链接 generateSaveReconciliationUrl

生成跳转到汇付天下的用户充值链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name       | type    | note              |
| ----       | ----    | ----              |
| begin-date | char(8) | 开始日期 YYYYMMDD |
| end-date   | char(8) | 结束日期 YYYYMMDD |
| page-num   | string  | 页数              |
| page-size  | string  | 每页记录数        |
| test       | boolean | 是否开启测试模式  |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name      | value              |
| ----      | ----               |
| Version   | 10                 |
| CmdId     | SaveReconciliation |
| MerCustId | 6000060004492053   |
| ChkValue  | 签名               |

```javascript
let begin_date = "20161001";
let end_date = "20161031";
let page_num = "1";
let page_size = "20";

rpc.call("bank_payment", "generateSaveReconciliationUrl", begin_date, end_date, page_num, page_size)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 200      |
| url  | string | 跳转链接 |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning |
| ---- | ----     |
| 500  | 未知错误 |

See [example](../data/bank-payment/generateSaveReconciliationUrl.json)
