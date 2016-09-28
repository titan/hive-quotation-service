<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [bank-payment](#bank-payment)
  - [ChangeLog](#changelog)
  - [Cache](#cache)
  - [API](#api)
    - [生成开户链接 generateUserRegisterUrl](#%E7%94%9F%E6%88%90%E5%BC%80%E6%88%B7%E9%93%BE%E6%8E%A5-generateuserregisterurl)
      - [request](#request)
      - [response](#response)
    - [生成充值链接 generateNetSaveUrl](#%E7%94%9F%E6%88%90%E5%85%85%E5%80%BC%E9%93%BE%E6%8E%A5-generatenetsaveurl)
      - [request](#request-1)
      - [response](#response-1)
    - [获得银行帐号 ID getCustomerId](#%E8%8E%B7%E5%BE%97%E9%93%B6%E8%A1%8C%E5%B8%90%E5%8F%B7-id-getcustomerid)
      - [request](#request-2)
      - [response](#response-2)
    - [生成绑卡链接 generateUserBindCardUrl](#%E7%94%9F%E6%88%90%E7%BB%91%E5%8D%A1%E9%93%BE%E6%8E%A5-generateuserbindcardurl)
      - [request](#request-3)
      - [response](#response-3)
    - [生成用户登录链接 generateUserLoginUrl](#%E7%94%9F%E6%88%90%E7%94%A8%E6%88%B7%E7%99%BB%E5%BD%95%E9%93%BE%E6%8E%A5-generateuserloginurl)
      - [request](#request-4)
      - [response](#response-4)
    - [生成自动投标计划链接 generateAutoTenderPlanUrl](#%E7%94%9F%E6%88%90%E8%87%AA%E5%8A%A8%E6%8A%95%E6%A0%87%E8%AE%A1%E5%88%92%E9%93%BE%E6%8E%A5-generateautotenderplanurl)
      - [request](#request-5)
      - [response](#response-5)
    - [生成余额查询链接(后台) generateQueryBalanceBgUrl](#%E7%94%9F%E6%88%90%E4%BD%99%E9%A2%9D%E6%9F%A5%E8%AF%A2%E9%93%BE%E6%8E%A5%E5%90%8E%E5%8F%B0-generatequerybalancebgurl)
      - [request](#request-6)
      - [response](#response-6)
    - [生成子账户查询链接(后台) generateQueryAcctsUrl](#%E7%94%9F%E6%88%90%E5%AD%90%E8%B4%A6%E6%88%B7%E6%9F%A5%E8%AF%A2%E9%93%BE%E6%8E%A5%E5%90%8E%E5%8F%B0-generatequeryacctsurl)
      - [request](#request-7)
      - [response](#response-7)
    - [生成交易状态查询链接 generateQueryTransStatUrl](#%E7%94%9F%E6%88%90%E4%BA%A4%E6%98%93%E7%8A%B6%E6%80%81%E6%9F%A5%E8%AF%A2%E9%93%BE%E6%8E%A5-generatequerytransstaturl)
      - [request](#request-8)
      - [response](#response-8)
    - [生成充值对账链接 generateSaveReconciliationUrl](#%E7%94%9F%E6%88%90%E5%85%85%E5%80%BC%E5%AF%B9%E8%B4%A6%E9%93%BE%E6%8E%A5-generatesavereconciliationurl)
      - [request](#request-9)
      - [response](#response-9)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# bank-payment

## ChangeLog

1. 2016-09-28
  * 增加生成自动投标链接接口。
  * 删除生成自动投标链接接口。

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

## Cache

| key            | type | value            | note                        |
| ----           | ---- | ----             | ----                        |
| bank-customers | hash | openid => custid | openid 与 custid 的对应关系 |

注意：openid 只有 25 个字节长。

## API

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

### 生成自动投标计划链接 generateAutoTenderPlanUrl

生成跳转到汇付天下的自动投标链接。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name            | type     | note                    |
| ----            | ----     | ----                    |
| customer-id     | char(16) | 汇付天下生成的用户 ID   |
| test            | boolean  | 是否开启测试模式        |

默认 test == false，开启测试模式后，返回汇付天下提供的测试链接。

在生成链接时，如下汇付天下接口参数不用调用者提供，但是在生成的 URL 必须出现：

| name           | value            |
| ----           | ----             |
| Version        | 10               |
| CmdId          | AutoTenderPlan   |
| MerCustId      | 6000060004492053 |
| TenderPlanType | 'W'              |
| RetUrl         | 见下面           |
| PageType       | 2                |
| ChkValue       | 签名             |

RetUrl:

| 场景 | 内容                                                     |
| ---- | ----                                                     |
| 正式 | http://m.fengchaohuzhu.com/bank/AutoTenderPlanCallback   |
| 测试 | http://dev.fengchaohuzhu.com/bank/AutoTenderPlanCallback |

url 作为参数传递时，需要调用 encodeURIComponent 进行编码。

```javascript
let customer_id = "0000000000000000";

rpc.call("bank_payment", "generateAutoTenderPlanUrl", customer_id)
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

See [example](../data/bank-payment/generateAutoTenderPlanUrl.json)

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
