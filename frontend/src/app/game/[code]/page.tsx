import GameClient from "@/components/game/GameClient";

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <GameClient code={decodeURIComponent(code).toUpperCase()} />;
}
