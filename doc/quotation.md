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

| name        | type                   | note             |
| ----        | ----                   | ----             |
| id          | uuid                   | 主键             |
| item        | plan-item              | 对应的 plan-item |
| quotas      | [quotation-item-quota] | 限额列表         |
| prices      | [quotation-item-price] | 价格列表         |

注意，[quotation-item-quota] 中，大多数情况都是只有一个元素，甚至为空。只有第三者险有多个元素。
prices 的长度与 quotas 相同，其内部的元素与 quotas 一一对应。

### quotation-item-price

| name       | type  | note     |
| ----       | ----  | ----     |
| id         | uuid  | 主键     |
| price      | float | 原价     |
| real-price | float | 真实价格 |

### quotation-item-quota

| name   | type   | note |
| ----   | ----   | ---- |
| id     | uuid   | 主键 |
| number | float  | 数量 |
| unit   | string | 单位 |

## 表结构

### quotation

quotation 不需要数据库表。

### quotation\_groups

| field          | type      | null | default | index   | reference |
| ----           | ----      | ---- | ----    | ----    | ----      |
| id             | uuid      |      |         | primary |           |
| vid            | uuid      |      |         |         | vehicles  |
| pid            | uuid      |      |         |         | plans     |
| is\_must\_have | bool      |      | false   |         |           |
| created\_at    | timestamp |      | now     |         |           |
| updated\_at    | timestamp |      | now     |         |           |

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
| qiid        | uuid      |      |         |         | quotation-items |
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
| qiid        | uuid      |      |         |         | quotation-items |
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

### request

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

### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码 |
| status | string | 结果内容 |

| code  | status   | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See [example](../data/quotation/deleteQuotationGroup.json)

### 获取车辆所有报价组信息 getQuotationGroups

### request

| name | type | note       |
| ---- | ---- | ----       |
| vid  | uuid | Vehicle ID |

```javascript
let vid = "00000000-0000-0000-0000-000000000000";

rpc.call("quotation", "getQuotationGroups", vid)
  .then(function (result) {

  }, function (error) {

  });
```
### response

| name   | type              | note           |
| ----   | ----              | ----           |
| groups | [quotation-group] | 车辆所有报价组 |

See [example](../data/quotation/getQuotationGroups.json)
