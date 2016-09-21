# bank-payment 模块

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

| name      | value        |
| ----      | ----         |
| Version   | 10           |
| CmdId     | UserRegister |
| MerCustId | 531157       |
| BgRetUrl  |              |
| RetUrl    |              |
| PageType  | 2            |
| ChkValue  | 签名         |

```javascript
let openid = "0000000000000000000000000";
let name = "丁一";
let idno = "010000194910010000";
let phone = "18800000000";

rpc.call("bank-payment", "generateUserRegisterUrl", openid, name, idno, phone)
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

| name      | value   |
| ----      | ----    |
| Version   | 10      |
| CmdId     | NetSave |
| MerCustId | 531157  |
| BgRetUrl  |         |
| RetUrl    |         |
| PageType  | 2       |
| ChkValue  | 签名    |

```javascript
let customer_id = "0000000000000000";
let order_id = "000000000000000000000000000000";
let order_date = "20161001";
let trans_amount = "100.00";

rpc.call("bank-payment", "generateNetSaveUrl", customer_id, order_id, order_date, trans_amount)
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
