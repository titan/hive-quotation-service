# Quotation 模块

## 数据结构

### quotation

| name         | type              | note         |
| ----         | ----              | ----         |
| id           | uuid              | 主键         |
| groups       | [quotation-group] | 对应计划集合 |
| vehicle      | vehicle           | 对应的车辆   |

报价的 ID 与 vehicle 的 ID 是一致的。

### quotation-group

| name         | type             | note         |
| ----         | ----             | ----         |
| id           | uuid             | 主键         |
| plan         | plan             | 对应的计划   |
| is-must-have | boolean          | 是否必选     |
| items        | [quotation-item] | 包含的 items |

### quotation-item

| name         | type                   | note             |
| ----         | ----                   | ----             |
| id           | uuid                   | 主键             |
| item         | plan-item              | 对应的 plan-item |
| is-must-have | boolean                | 是否必选         |
| quotas       | [quotation-item-quota] | 限额列表         |
| prices       | [quotation-item-price] | 价格列表         |

注意，[quotation-item-quota] 中，大多数情况都是只有一个元素，甚至为空。只有第三者险有多个元素。
prices 的长度与 quotas 相同，其内部的元素与 quotas 一一对应。

### quotation-item-price

| name       | type  | note     |
| ----       | ----  | ----     |
| id         | uuid  | 主键     |
| price      | float | 原价     |
| real-price | float | 真实价格 |

### quotation-item-quota

| name | type   | note |
| ---- | ----   | ---- |
| id   | uuid   | 主键 |
| num  | float  | 数量 |
| unit | string | 单位 |

## 表结构

### quotations

| field | type | null | default | index   | reference |
| ----  | ---- | ---- | ----    | ----    | ----      |
| id    | uuid |      |         | primary |           |
| vid   | uuid |      |         |         | vehicles  |

### quotation\_groups

| field          | type      | null | default | index   | reference  |
| ----           | ----      | ---- | ----    | ----    | ----       |
| id             | uuid      |      |         | primary |            |
| qid            | uuid      |      |         |         | quotations |
| pid            | uuid      |      |         |         | plans      |
| is\_must\_have | bool      |      | false   |         |            |
| created\_at    | timestamp |      | now     |         |            |
| updated\_at    | timestamp |      | now     |         |            |

### quotation\_items

| field          | type      | null | default | index   | reference         |
| ----           | ----      | ---- | ----    | ----    | ----              |
| id             | uuid      |      |         | primary |                   |
| qgid           | uuid      |      |         |         | quotation\_groups |
| piid           | uuid      |      |         |         | plan\_items       |
| is\_must\_have | bool      |      | false   |         |                   |
| created\_at    | timestamp |      | now     |         |                   |
| updated\_at    | timestamp |      | now     |         |                   |

### quotation\_item\_quotas

| field       | type      | null | default | index   | reference       |
| ----        | ----      | ---- | ----    | ----    | ----            |
| id          | uuid      |      |         | primary |                 |
| qiid        | uuid      |      |         |         | quotation\_items|
| number      | float     |      |         |         |                 |
| unit        | char(16)  |      |         |         |                 |
| sorted      | int       |      | 0       |         |                 |
| created\_at | timestamp |      | now     |         |                 |
| updated\_at | timestamp |      | now     |         |                 |

sorted 是元素在列表中的顺序

### quotation\_item\_prices

| field       | type      | null | default | index   | reference       |
| ----        | ----      | ---- | ----    | ----    | ----            |
| id          | uuid      |      |         | primary |                 |
| qiid        | uuid      |      |         |         | quotation\_items|
| price       | float     |      |         |         |                 |
| real\_price | float     |      |         |         |                 |
| sorted      | int       |      | 0       |         |                 |
| created\_at | timestamp |      | now     |         |                 |
| updated\_at | timestamp |      | now     |         |                 |

sorted 是元素在列表中的顺序

## 缓存结构

### quotation

| key        | type | value               | note         |
| ----       | ---- | ----                | ----         |
| quotations | hash | 报价ID => 报价 JSON | 所有报价实体 |

## 接口

### 增加报价组 addQuotationGroup

不能从 mobile 域调用!

#### request

| name           | type    | note     |
| ----           | ----    | ----     |
| vid            | uuid    | 车辆 ID  |
| pid            | uuid    | 计划 ID  |
| is\_must\_have | boolean | 是否必选 |

```javascript
let vid = "00000000-0000-0000-0000-000000000000";
let pid = "00000000-0000-0000-0000-000000000000";
let is_must_have = true;

rpc.call("quotation", "addQuotationGroup", vid, pid, is_must_have)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name               | type | note               |
| ----               | ---- | ----               |
| quotation-group-id | uuid | Quotation Group ID |

See [example](../data/quotation/addQuotationGroup.json)

### 删除报价组 deleteQuotationGroup

不能从 mobile 域调用!

#### request

| name | type | note               |
| ---- | ---- | ----               |
| gid  | uuid | Quotation Group ID |

```javascript
let gid = "00000000-0000-0000-0000-000000000000";

rpc.call("quotation", "deleteQuotationGroup", gid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码 |
| status | string | 结果内容 |

| code  | status   | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See [example](../data/quotation/deleteQuotationGroup.json)

### 增加报价条目 addQuotationItem

不能从 mobile 域调用!

#### request

| name           | type    | note        |
| ----           | ----    | ----        |
| qgid           | uuid    | 报价组 ID   |
| piid           | uuid    | 计划条目 ID |
| is\_must\_have | boolean | 是否必选    |

```javascript
let qgid = "00000000-0000-0000-0000-000000000000";
let piid = "00000000-0000-0000-0000-000000000000";
let is_must_have = true;

rpc.call("quotation", "addQuotationItem", qgid, piid, is_must_have)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name              | type | note              |
| ----              | ---- | ----              |
| quotation-item-id | uuid | Quotation Item ID |

See [example](../data/quotation/addQuotationItem.json)

### 删除报价条目 deleteQuotationItem

不能从 mobile 域调用!

#### request

| name | type | note              |
| ---- | ---- | ----              |
| qiid | uuid | Quotation Item ID |

```javascript
let qiid = "00000000-0000-0000-0000-000000000000";

rpc.call("quotation", "deleteQuotationItem", qiid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码 |
| status | string | 结果内容 |

| code  | status   | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See [example](../data/quotation/deleteQuotationItem.json)

### 增加报价限额 addQuotationQuota

不能从 mobile 域调用!

#### request

| name   | type    | note        |
| ----   | ----    | ----        |
| qiid   | uuid    | 报价条目 ID |
| number | float   | 数量        |
| unit   | string  | 单位        |
| sorted | integer | 排序顺序    |

```javascript
let qiid = "00000000-0000-0000-0000-000000000000";
let number = 3;
let unit = "块漆";
let sorted = 1;

rpc.call("quotation", "addQuotationQuota", qiid, number, unit, sorted)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name               | type | note               |
| ----               | ---- | ----               |
| quotation-quota-id | uuid | Quotation Quota ID |

See [example](../data/quotation/addQuotationQuota.json)

### 删除报价限额 deleteQuotationQuota

不能从 mobile 域调用!

#### request

| name | type | note               |
| ---- | ---- | ----               |
| qqid | uuid | Quotation Quota ID |

```javascript
let qqid = "00000000-0000-0000-0000-000000000000";

rpc.call("quotation", "deleteQuotationQuota", qqid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码 |
| status | string | 结果内容 |

| code  | status   | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See [example](../data/quotation/deleteQuotationQuota.json)

### 增加报价价格 addQuotationPrice

不能从 mobile 域调用!

#### request

| name        | type    | note        |
| ----        | ----    | ----        |
| qiid        | uuid    | 报价条目 ID |
| price       | float   | 原价        |
| real\_price | float   | 真实价格    |
| sorted      | integer | 排序顺序    |

```javascript
let qiid = "00000000-0000-0000-0000-000000000000";
let price = 1000;
let real_price = 600;
let sorted = 1;

rpc.call("quotation", "addQuotationPrice", qiid, price, real_price, sorted)
  .then(function (result) {

  }, function (error) {

  });

```

#### response

| name               | type | note               |
| ----               | ---- | ----               |
| quotation-price-id | uuid | Quotation Price ID |

See [example](../data/quotation/addQuotationPrice.json)

### 删除报价价格 deleteQuotationPrice

不能从 mobile 域调用!

#### request

| name | type | note               |
| ---- | ---- | ----               |
| qpid | uuid | Quotation Price ID |

```javascript
let qpid = "00000000-0000-0000-0000-000000000000";

rpc.call("quotation", "deleteQuotationPrice", qpid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码 |
| status | string | 结果内容 |

| code  | status   | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See [example](../data/quotation/deleteQuotationPrice.json)


### 获取车辆报价信息 getQuotation

#### request

| name | type | note       |
| ---- | ---- | ----       |
| vid  | uuid | Vehicle ID |

```javascript
let vid = "00000000-0000-0000-0000-000000000000";

rpc.call("quotation", "getQuotation", vid)
  .then(function (result) {

  }, function (error) {

  });
```
#### response

| name      | type      | note         |
| ----      | ----      | ----         |
| quotation | quotation | 车辆报价信息 |

See [example](../data/quotation/getQuotation.json)