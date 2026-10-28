import { supabaseRequest } from "./supabase.js";
import { setBlockchainElectionActive } from "./blockchain.js";

const CONTROL_PREFIX = "__NACOS_UNN_ELECTION_CONTROL__:";
const CONTROL_ORDER = -999999;

function toStatus(row) {
  const votingOpen = !row || row.title === `${CONTROL_PREFIX}OPEN`;
  return {
    votingOpen,
    updatedAt: row?.created_at || null,
  };
}

export async function getElectionStatus() {
  const rows = await supabaseRequest("posts", {
    query: {
      select: "id,title,created_at",
      title: `like.${CONTROL_PREFIX}%`,
      order: "created_at.desc",
      limit: "1",
    },
  });

  if (rows.length) {
    return toStatus(rows[0]);
  }

  const [settings] = await supabaseRequest("posts", {
    method: "POST",
    body: [
      {
        title: `${CONTROL_PREFIX}OPEN`,
        display_order: CONTROL_ORDER,
        is_active: false,
      },
    ],
  });

  return toStatus(settings);
}

export async function setElectionStatus(votingOpen) {
  const previous = await getElectionStatus();

  async function persistStatus(value) {
    const existing = await supabaseRequest("posts", {
      query: {
        select: "id",
        title: `like.${CONTROL_PREFIX}%`,
        order: "created_at.desc",
      },
    });

    if (existing.length) {
      await supabaseRequest("posts", {
        method: "DELETE",
        query: { id: `in.(${existing.map((row) => row.id).join(",")})` },
      });
    }

    const [settings] = await supabaseRequest("posts", {
      method: "POST",
      body: [
        {
          title: `${CONTROL_PREFIX}${value ? "OPEN" : "CLOSED"}`,
          display_order: CONTROL_ORDER,
          is_active: false,
        },
      ],
    });

    return toStatus(settings);
  }

  await setBlockchainElectionActive(votingOpen);

  try {
    return await persistStatus(votingOpen);
  } catch (error) {
    try {
      await persistStatus(previous.votingOpen);
      await setBlockchainElectionActive(previous.votingOpen);
    } catch (rollbackError) {
      throw new Error(
        `Election status update failed (${error.message}); rollback failed (${rollbackError.message}).`
      );
    }
    throw error;
  }
}
