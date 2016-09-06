

CREATE TABLE quotations(
    id uuid PRIMARY KEY,
    vid uuid NOT NULL,
    state int DEFAULT 0,
    FOREIGN KEY (vid) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE TABLE quotation_groups(
    id uuid PRIMARY KEY,
    qid uuid NOT NULL,
    pid uuid NOT NULL,
    is_must_have boolean DEFAULT false,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    FOREIGN KEY (qid) REFERENCES quotations(id),
    FOREIGN KEY (pid) REFERENCES plans(id)
);

CREATE TABLE quotation_items(
    id uuid PRIMARY KEY,
    piid uuid NOT NULL,
    qgid uuid NOT NULL,
    FOREIGN KEY (piid) REFERENCES plan_items(id),
    FOREIGN KEY (qgid) REFERENCES quotation_groups(id) ON DELETE CASCADE
);

CREATE TABLE quotation_item_quotas(
    id uuid PRIMARY KEY,
    qiid uuid NOT NULL,
    num float NOT NULL,
    unit char(16) NOT NULL,
    sorted int DEFAULT 0,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    FOREIGN KEY (qiid) REFERENCES quotation_items(id) ON DELETE CASCADE
);

CREATE TABLE quotation_item_prices(
    id uuid PRIMARY KEY,
    qiid uuid NOT NULL,
    price float NOT NULL,
    real_price float NOT NULL,
    sorted int DEFAULT 0,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    FOREIGN KEY (qiid) REFERENCES quotation_items(id) ON DELETE CASCADE
);
