import { SetMetadata } from '@nestjs/common';

export const ALLOW_CUSTOMER_KEY = 'auth:allow-customer';

export const AllowCustomer = () => SetMetadata(ALLOW_CUSTOMER_KEY, true);
