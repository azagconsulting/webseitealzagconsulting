import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
  Delete,
  Param,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthGuard } from '@nestjs/passport';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { AdminGuard } from './guards/admin.guard';

@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'users',
  version: '1',
})
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.listEmployees();
  }

  @Patch('me')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!user) {
      throw new UnauthorizedException('Anfrage ohne Benutzerkontext');
    }

    return this.usersService.updateProfile(user.sub, dto);
  }

  @Patch('me/password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!user) {
      throw new UnauthorizedException('Anfrage ohne Benutzerkontext');
    }

    return this.usersService.changePassword(user.sub, dto);
  }

  @Patch('me/email')
  async changeEmail(
    @Body() dto: ChangeEmailDto,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!user) {
      throw new UnauthorizedException('Anfrage ohne Benutzerkontext');
    }

    return this.usersService.changeEmail(user.sub, dto);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateEmployeeDto) {
    return this.usersService.createEmployee(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.usersService.updateEmployee(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.usersService.deleteEmployee(id);
  }
}
