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
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createDDaySchema,
  createTaskSchema,
  setLogNoteSchema,
  setStudyGoalSchema,
  startStudySchema,
  updateTaskSchema,
  type CreateDDayInput,
  type CreateTaskInput,
  type SetLogNoteInput,
  type SetStudyGoalInput,
  type StartStudyInput,
  type StudyDDayResponse,
  type StudyNoteResponse,
  type StudySessionResponse,
  type StudySummaryResponse,
  type StudyTaskResponse,
  type UpdateTaskInput,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { StudyService } from './study.service';
import { StudyPlanService } from './study-plan.service';
import { StudyGateway } from './study.gateway';

@Controller('study')
export class StudyController {
  constructor(
    private readonly study: StudyService,
    private readonly plan: StudyPlanService,
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

  // -----------------------------------------------------------------------
  // Đợt 2 — mốc đếm ngược · việc cần làm · nhật ký
  //
  // Tất cả nằm TRƯỚC nhóm `/:id` của phiên học. Nest khớp route theo thứ tự
  // khai báo, nên "ddays" đặt sau sẽ bị `@Post(':id/join')` và họ hàng nuốt mất.
  // -----------------------------------------------------------------------

  @Post('ddays')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  async createDDay(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createDDaySchema)) dto: CreateDDayInput,
  ): Promise<StudyDDayResponse> {
    return this.plan.createDDay(userId, dto);
  }

  @Delete('ddays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDDay(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.plan.deleteDDay(userId, id);
  }

  @Post('tasks')
  @Throttle({ default: { limit: 200, ttl: 3_600_000 } })
  async createTask(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createTaskSchema)) dto: CreateTaskInput,
  ): Promise<StudyTaskResponse> {
    return this.plan.createTask(userId, dto);
  }

  @Patch('tasks/:id')
  async updateTask(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updateTaskSchema)) dto: UpdateTaskInput,
  ): Promise<StudyTaskResponse> {
    return this.plan.updateTask(userId, id, dto);
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.plan.deleteTask(userId, id);
  }

  /**
   * Ghi nhật ký cho một chặng đã học.
   *
   * `logId` KHÔNG qua `ParseUUIDPipe`: khoá chính của `StudyLog` là `BigInt`
   * tự tăng, không phải uuid. Service tự kiểm và trả 404 nếu không đọc được.
   */
  @Put('logs/:logId/note')
  @HttpCode(HttpStatus.OK)
  async setNote(
    @CurrentUserId() userId: string,
    @Param('logId') logId: string,
    @Body(new ZodBody(setLogNoteSchema)) dto: SetLogNoteInput,
  ): Promise<StudyNoteResponse> {
    return this.plan.setNote(userId, logId, dto);
  }

  // -----------------------------------------------------------------------
  // Phiên học
  // -----------------------------------------------------------------------

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
