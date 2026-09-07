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
  Query,
} from '@nestjs/common';
import {
  createEventSchema,
  eventRangeSchema,
  updateEventSchema,
  type CreateEventInput,
  type EventRangeQuery,
  type EventResponse,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Lịch trong một khoảng thời gian. Trả về mọi sự kiện GIAO với khoảng đó. */
  @Get()
  async findRange(
    @CurrentUserId() userId: string,
    @Query(new ZodBody(eventRangeSchema)) query: EventRangeQuery,
  ): Promise<EventResponse[]> {
    return this.events.findRange(userId, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EventResponse> {
    return this.events.findOne(userId, id);
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createEventSchema)) dto: CreateEventInput,
  ): Promise<EventResponse> {
    return this.events.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updateEventSchema)) dto: CreateEventInput,
  ): Promise<EventResponse> {
    return this.events.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.events.remove(userId, id);
  }
}
