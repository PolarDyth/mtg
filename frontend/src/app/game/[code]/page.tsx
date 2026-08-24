import GameClient from "@/components/game/GameClient";
import { decodeRoomCode } from "@/lib/roomCode";

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <GameClient code={decodeRoomCode(code)} />;
}
