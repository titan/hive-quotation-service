export interface Quota {
    num: number;
    unit: string;
};

export interface Price {
    price: number;
    real_price: number;
}

export interface Item {
    piid: string;
    quotas: Quota[];
    prices: Price[];
};

export interface Group {
    pid: string;
    items: Item[];
};
