import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createPlaceSchema,
  updatePlaceSchema,
  type CreatePlaceInput,
  type PlaceResponse,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  async list(@CurrentUserId() userId: string): Promise<PlaceResponse[]> {
    return this.places.list(userId);
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createPlaceSchema)) dto: CreatePlaceInput,
  ): Promise<PlaceResponse> {
    return this.places.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updatePlaceSchema)) dto: CreatePlaceInput,
  ): Promise<PlaceResponse> {
    return this.places.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.places.remove(userId, id);
  }
}
