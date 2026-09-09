import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GameKind } from '@prisma/client';
import { z } from 'zod';
import {
  createGameSchema,
  gameMoveEnvelopeSchema,
  type CreateGameInput,
  type GameMoveEnvelope,
  type GameResponse,
  type GameSummaryResponse,
} from '@beside/shared';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { CurrentUserId } from '../auth/current-user.decorator';
import { GamesService } from './games.service';
import { GamesGateway } from './games.gateway';

const listQuerySchema = z.object({
  kind: z.nativeEnum(GameKind).optional(),
});

@Controller('games')
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly gateway: GamesGateway,
  ) {}

  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Query(new ZodBody(listQuerySchema)) query: { kind?: GameKind },
  ): Promise<GameResponse[]> {
    return this.games.list(userId, query.kind);
  }

  /**
   * Đặt TRƯỚC route `:id` — nếu để sau, Nest khớp "summary" vào `:id` rồi
   * `ParseUUIDPipe` báo lỗi. Cùng bài học với `posts/photos/:photoId`.
   */
  @Get('summary')
  async summary(@CurrentUserId() userId: string): Promise<GameSummaryResponse> {
    return this.games.summary(userId);
  }

  @Post()
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodBody(createGameSchema)) dto: CreateGameInput,
  ): Promise<GameResponse> {
    const game = await this.games.create(userId, dto.kind);
    await this.gateway.syncAndBroadcast(game.id, game.turnUserId);
    return game;
  }

  @Get(':id')
  async get(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GameResponse> {
    return this.games.get(userId, id);
  }

  /**
   * Nước đi đi bằng REST chứ không qua WebSocket: nó cần mã lỗi rõ ràng ("chưa
   * tới lượt bạn", "ô này đã có quân") và cơ chế thử lại sẵn có của HTTP. Ván
   * 30 giây một lượt không cần tiết kiệm một nhịp mạng.
   *
   * WebSocket chỉ làm đúng một việc: đẩy state mới về cho cả hai người.
   */
  @Post(':id/moves')
  @HttpCode(HttpStatus.OK)
  async move(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(gameMoveEnvelopeSchema)) dto: GameMoveEnvelope,
  ): Promise<GameResponse> {
    const game = await this.games.move(userId, id, dto.version, dto.move);
    // Lượt vừa đổi tay — người tới lượt có thể đang không mở app, xem
    // `syncAndBroadcast`.
    await this.gateway.syncAndBroadcast(game.id, game.turnUserId);
    return game;
  }

  @Post(':id/resign')
  @HttpCode(HttpStatus.OK)
  async resign(
    @CurrentUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GameResponse> {
    const game = await this.games.resign(userId, id);
    await this.gateway.broadcastGame(game.id);
    return game;
  }
}
