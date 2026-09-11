import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  setStudyGoalSchema,
  startStudySchema,
  type SetStudyGoalInput,
  type StartStudyInput,
  type StudySessionResponse,
  type StudySummaryResponse,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { StudyService } from './study.service';
import { StudyGateway } from './study.gateway';

@Controller('study')
export class StudyController {
  constructor(
    private readonly study: StudyService,
    private readonly gateway: StudyGateway,
  ) {}

  /** Đặt TRƯỚC các route `:id` — nếu không "summary" sẽ khớp vào `:id`. */
  @Get('summary')
  async summary(@CurrentUserId() userId: string): Promise<StudySummaryResponse> {
    return this.study.summary(userId);
  }

  @Get('current')
  async current(@CurrentUserId() userId: string): Promise<StudySessionResponse | null> {
    return this.study.current(userId);
  }

  /**
   * Mục tiêu phút mỗi ngày của CHÍNH mình. Đặt trước các route `:id` cùng lý do
   * với `summary` — nếu không "goal" sẽ khớp vào `:id` rồi chết ở `ParseUUIDPipe`.
   */
  @Put('goal')
  @HttpCode(HttpStatus.OK)
  async setGoal(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(setStudyGoalSchema)) dto: SetStudyGoalInput,
  ): Promise<{ dailyGoalMin: number }> {
    return { dailyGoalMin: await this.study.setGoal(userId, dto) };
  }

  @Post()
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  async start(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(startStudySchema)) dto: StartStudyInput,
  ): Promise<StudySessionResponse> {
    const session = await this.study.start(userId, dto);
    await this.gateway.broadcastFor(userId);
    return session;
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  async join(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StudySessionResponse> {
    const session = await this.study.join(userId, id);
    await this.gateway.broadcastFor(userId);
    return session;
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  async leave(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StudySessionResponse | null> {
    const session = await this.study.leave(userId, id);
    await this.gateway.broadcastFor(userId);
    return session;
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StudySessionResponse> {
    const session = await this.study.cancel(userId, id);
    await this.gateway.broadcastFor(userId);
    return session;
  }
}
