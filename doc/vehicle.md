# Vehicles  模块

## 数据结构

### vehicle-model

| name                 | type    | note           |
| ----                 | ----    | ----           |
| vehicle\_code        | string  | 车型代码       |
| vin\_code            | string  | VIN码          |
| vehicle\_name        | string  | 车型名称       |
| brand\_name          | string  | 品牌名称       |
| family\_name         | string  | 车系名称       |
| body\_type           | string  | 车身结构       |
| engine\_number       | string  | 车身结构       |
| engine\_desc         | string  | 发动机描述     |
| gearbox\_name        | string  | 变速箱类型     |
| year\_pattern        | string  | 车款           |
| group\_name          | string  | 车组名称       |
| cfg\_level           | string  | 配置级别       |
| purchase\_price      | float   | 新车购置价     |
| purchase\_price\_tax | float   | 新车购置价含税 |
| seat                 | integer | 座位           |
| effluent\_standard   | string  | 排放标准       |
| pl                   | string  | 排量           |
| fuel\_jet\_type      | string  | 燃油类型       |
| driven\_type         | string  | 驱动形式       |

### vehicle

| name                     | type     | note                   |
| ----                     | ----     | ----                   |
| id                       | uuid     | 车ID                   |
| user\_id                 | user     | 用户                   |
| owner                    | person   | 车主                   |
| owner_type               | int      | 车主类型               |
| recommend                | string   | 推荐人               |
| drivers                  | [person] | 驾驶人                 |
| vehicle\_code            | string   | 车型代码               |
| license\_no              | string   | 车牌                   |
| engine\_no               | string   | 发动机号               |
| register\_date           | iso8601  | 车辆注册日期           |
| average\_mileage         | string   | 年平均行驶里程         |
| is\_transfer             | boolean  | 是否过户车             |
| receipt\_no              | string   | 新车购置发票号         |
| receipt\_date            | iso8601  | 发票开票日期           |
| last\_insurance\_company | string   | 最近一次投保的保险公司 |
| insurance\_due\_date     | date     | 保险到期时间           |
| driving\_frontal\_view   | string   | 行驶证正面照           |
| driving\_rear\_view      | string   | 行驶证背面照           |

### person

| name                    | type   | note         |
| ----                    | ----   | ----         |
| id                      | uuid   | personID     |
| name                    | string | 姓名         |
| identity\_no            | string | 身份证       |
| phone                   | string | 手机号       |
| identity\_frontal\_view | string | 身份证正面照 |
| identity\_rear\_view    | string | 身份证背面照 |
| license\_frontal\_view  | string | 驾照正面照   |
| license\_rear\_view     | string | 驾照背面照   |



## 接口

### 获得车型 getVehicleModelsByMake

#### request

| name          | type   | note     |
| ----          | ----   | ----     |
| vehicle\_code | string | 车型代码 |

##### example

```javascript
var code = "I0000000000000000250000000000041";

rpc.call("vehicle", "getVehicleModelsByMake", code)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name          | type          | note          |
| ----          | ----          | ----          |
| vehicle-model | vehicle-model | Vehicle Model |

See [example](../data/vehicle/getVehicleModelsByMake.json)

### 获取报价提交表单(新车已上牌)(个人) setVehicleInfoOnCard

#### request

| name                     | type     | note           |
| ----                     | ----     | ----           |
| name         | string  | 驾驶人姓名       |
| identity\_no | string  | 身份证编号       |
| phone        | string  | 电话号码         |
| recommend    | string  | 推荐人           |
| vehicle\_code            | string   | 车型代码       |
| license\_no              | string   | 车牌           |
| engine\_no               | string   | 发动机号       |
| register\_date           | iso8601  | 注册日期       |
| average\_mileage         | string   | 年平均行驶里程 |
| is\_transfer             | boolean  | 是否过户       |
| last\_insurance\_company | string   | 上次投保的公司 |
| insurance\_due\_date     | iso8601  | 保险到期时间   |

##### example

```javascript
var name = "";
var identity_no = "";
var phone = "";
var recommend = "";
var vehicle_code = ""; 
var license_no = ""; 
var engine_no = ""; 
var register_date = ""; 
var average_mileage = ""; 
var is_transfer = "";
var last_insurance_company = ""; 
var insurance_due_date = "";

rpc.call("vehicle", "setVehicleInfoOnCard", name, identity_no, phone, recommend, vehicle_code, license_no, engine_no, 
  register_date, average_mileage, is_transfer,last_insurance_company, insurance_due_date)
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


### 获取报价提交表单(新车未上牌)(个人) setVehicleInfo

#### request

| name                     | type     | note           |
| ----                     | ----     | ----           |
| name         | string  | 驾驶人姓名       |
| identity\_no | string  | 身份证编号       |
| phone        | string  | 电话号码         |
| recommend    | string  | 推荐人           |
| vehicle\_code            | string   | 车型代码       |
| license\_no              | string   | 车牌           |
| engine\_no               | string   | 发动机号       |
| receipt\_no              | string   | 发票编号       |
| receipt\_date            | iso8601  | 发票开具时间   |
| average\_mileage         | string   | 年平均行驶里程 |
| is\_transfer             | boolean  | 是否过户       |
| last\_insurance\_company | string   | 上次投保的公司 |

##### example

```javascript
var name = "";
var identity_no = "";
var phone = "";
var recommend = "";
var vehicle_code = ""; 
var license_no = ""; 
var engine_no = ""; 
var average_mileage = ""; 
var is_transfer = "";
var receipt_no = ""; 
var receipt_date = "";
var last_insurance_company = ""; 

rpc.call("vehicle", "setVehicleInfo", name, identity_no, phone, recommend, vehicle_code, license_no, engine_no, 
  receipt_no, receipt_date, average_mileage, is_transfer,last_insurance_company)
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

See [example](../data/vehicle/setVehicleInfo.json)

### 获取报价提交表单(新车已上牌)(企业) setVehicleInfoOnCardEnterprise

#### request

| name                     | type     | note           |
| ----                     | ----     | ----           |
| name         | string  | 企业名称       |
| society_code | string  | 统一社会信用代码  |
| contact_name | string  | 指定联系人       |
| contact_phone        | string  | 联系人手机号        |
| recommend    | string  | 推荐人           |
| vehicle\_code            | string   | 车型代码       |
| license\_no              | string   | 车牌           |
| engine\_no               | string   | 发动机号       |
| register\_date           | iso8601  | 注册日期       |
| average\_mileage         | string   | 年平均行驶里程 |
| is\_transfer             | boolean  | 是否过户       |
| last\_insurance\_company | string   | 上次投保的公司 |
| insurance\_due\_date     | iso8601  | 保险到期时间   |

##### example

```javascript
var name = "";
var society_code = "";
var contact_name = "";
var contact_phone = "";
var recommend = "";
var vehicle_code = ""; 
var license_no = ""; 
var engine_no = ""; 
var register_date = ""; 
var average_mileage = ""; 
var is_transfer = "";
var last_insurance_company = ""; 
var insurance_due_date = "";

rpc.call("vehicle", "setVehicleInfoOnCard", name, society_code, contact_name, contact_phone, recommend, vehicle_code, license_no, engine_no, 
  register_date, average_mileage, is_transfer,last_insurance_company, insurance_due_date)
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


### 获取报价提交表单(新车未上牌)(企业) setVehicleInfo

#### request

| name                     | type     | note           |
| ----                     | ----     | ----           |
| name         | string  | 企业名称       |
| society_code | string  | 统一社会信用代码  |
| contact_name | string  | 指定联系人       |
| contact_phone        | string  | 联系人手机号        |
| recommend    | string  | 推荐人           |
| vehicle\_code            | string   | 车型代码       |
| license\_no              | string   | 车牌           |
| engine\_no               | string   | 发动机号       |
| receipt\_no              | string   | 发票编号       |
| receipt\_date            | iso8601  | 发票开具时间   |
| average\_mileage         | string   | 年平均行驶里程 |
| is\_transfer             | boolean  | 是否过户       |
| last\_insurance\_company | string   | 上次投保的公司 |

##### example

```javascript
var name = "";
var society_code = "";
var contact_name = "";
var contact_phone = "";
var recommend = "";
var vehicle_code = ""; 
var license_no = ""; 
var engine_no = ""; 
var average_mileage = ""; 
var is_transfer = "";
var receipt_no = ""; 
var receipt_date = "";
var last_insurance_company = ""; 

rpc.call("vehicle", "setVehicleInfo", name, society_code, contact_name, contact_phone, recommend, vehicle_code, license_no, engine_no, 
  receipt_no, receipt_date, average_mileage, is_transfer,last_insurance_company)
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


### 提交驾驶人信息 setDriverInfo

#### request

| name         | type    | note             |
| ----         | ----    | ----             |
| vid          | uuid    | 车辆 ID          |
| drivers                  | [person] | 驾驶人信息     |

```javascript

var drivers = [
  {
    name: "",
    identity_no: "",
    phone: "",
    is_primary: ""
  }
];

rpc.call("vehicle", "setDriverInfo", vid, drivers)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name | type | note      |
| ---- | ---- | ----      |
| pid  | uuid | Person ID |

See [example](../data/vehicle/setVehicleInfo.json)

### 修改驾驶人信息 changeDriverInfo

```javascript
var vid = ""; 
var name = "";
var identity_no = "";
var phone = "";

rpc.call("vehicle", "changeDriverInfo", vid, name, identity_no, phone)
  .then(function (result) {

  }, function (error) {

  });
```

### 获取所有车信息 getVehicleInfos

##### example

```javascript
rpc.call("vehicle", "getVehicleInfos", uid)
  .then(function (result) {

  }, function (error) {

  });
```

See [example](../data/vehicle/getVehicleInfos.json)

### 获取某个车信息 getVehicleInfo

##### example

```javascript

let vid = "00000000-0000-0000-0000-000000000000";
rpc.call("vehicle", "getVehicleInfo"， vid)
  .then(function (result) {

  }, function (error) {

  });

```

See [example](../data/vehicle/getVehicleInfos.json)

### 获取驾驶人信息 getDriverPids
### 注：前端禁用

```javascript
var vid = "00000000-0000-0000-0000-000000000000";

rpc.call("vehicle", "getDriverPids", vid)
  .then(function (result) {

  }, function (error) {

  });
```

### 上传证件照 uploadDriverImages


```javascript

var vid = "00000000-0000-0000-0000-000000000000";
var driving_frontal_view = "";
var driving_rear_view = "";
var identity_frontal_view = "";
var identity_rear_view = "";
var license_frontal_views = {};

rpc.call("vehicle", "uploadDriverImages", vid, driving_frontal_view, driving_rear_view, identity_frontal_view, identity_rear_view, license_frontal_views)
  .then(function (result) {

  }, function (error) {

  });
```
