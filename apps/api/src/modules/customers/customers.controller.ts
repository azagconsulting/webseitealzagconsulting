import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerContactDto } from './dto/create-customer.dto';

type UploadedCsvFile = {
  buffer: Buffer;
};

@Controller({
  path: 'customers',
  version: '1',
})
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() body: CreateCustomerDto) {
    return this.customersService.createCustomer(body);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  import(@UploadedFile() file?: UploadedCsvFile) {
    if (!file) {
      throw new BadRequestException('CSV-Datei fehlt.');
    }
    return this.customersService.importCustomersFromCsv(file.buffer);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
    return this.customersService.updateCustomer(id, body);
  }

  @Post(':id/service-orders')
  createServiceOrder(
    @Param('id') id: string,
    @Body() body: CreateServiceOrderDto,
  ) {
    return this.customersService.createServiceOrder(id, body);
  }

  @Post(':id/contacts')
  createContact(
    @Param('id') id: string,
    @Body() body: CreateCustomerContactDto,
  ) {
    return this.customersService.createContact(id, body);
  }

  @Get()
  list(@Query() query: ListCustomersDto) {
    return this.customersService.listCustomers(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.customersService.findCustomer(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteCustomer(id);
  }
}
