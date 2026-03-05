import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

type ImportChunk = {
  id: string;
  chunkIndex: number;
  text: string;
  charCount: number;
  embeddingVector: number[] | null;
  embeddingModel: string | null;
  embeddingDim: number | null;
};

type ImportDocument = {
  movieTmdbId: number;
  seasonSlug: string | null;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  contentHash: string;
  publishedAt: string | null;
  license: string | null;
  chunks: ImportChunk[];
};

type ImportPayload = {
  generatedAt: string;
  season: string | null;
  documentCount: number;
  chunkCount: number;
  documents: ImportDocument[];
};

type CliOptions = {
  input: string;
};

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const inputIndex = args.findIndex((arg) => arg === "--input");
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error("Missing required --input <path-to-evidence-corpus.json>");
  }
  return { input: args[inputIndex + 1]! };
}

function isValidPayload(value: unknown): value is ImportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ImportPayload>;
  return Boolean(
    typeof payload.generatedAt === "string"
    && Array.isArray(payloay.documents)
  );
}

async function main(): Promise<void> {
  const cli = parseCli();
  const raw = await readFile(resolve(cli.input), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isValidPayload(parsed)) {
    throw new Error("Invalid evidence corpus payload");
  }

  const prisma = new PrismaClient();
  try {
    const tmdIds = new Set(parsed.documents.map((d) => d.movieTmdbId));
    const movies = await prisma.movie.findMany({
      where: { tmdbId: {[[�N�ˋ��YY�HHK��[X���Y��YK�Y�Y��YK�_K�JN�ۜ�[ݚYRY�UY�H�]�X\
[ݚY\˛X\

JHO��K�YYK�YH\��ۜ�
JN�ۜ�Z\��[��Y�Y�Hˋ��YY�K��[\�
Y
HO�[[ݚYRY�UY��\�Y
JNY�
Z\��[��Y�Y˛[���
H�ۜ��K��\���\��[�Έ	�Z\��[��Y�Y˛[��HQ�Q�����[�[��][�ˈ�\��L�	�Z\��[��Y�Y˜�X�JL
K���[���_X
NB��]��[Y[��[\ܝYH]��[Y[����\YH]�[���[\ܝYH��܈
�ۜ���و\��Y���[Y[��H�ۜ�[ݚYRYH[ݚYRY�UY���]
�˛[ݚYUY�Y
NY�
[[ݚYRY
H��[Y[����\Y
���۝[�YNB���ۜ�\�\�Y��H]�Z]�\�XK�]�Y[��Q��[Y[��\�\�
�\�N����\��S�[YW�\�����\��S�[YN��˜��\��S�[YK\���˝\�HK�ܙX]N��[ݚYRY��X\�۔�YΈ�˜�X\�۔�Y����\��S�[YN��˜��\��S�[YK�\���˝\��]N��˝]K��۝[���˘�۝[���۝[�\���˘�۝[�\��X�\�Y]��˜X�\�Y]��]�]J�˜X�\�Y]
H��[�X�[��N��˛X�[��K�WK�\]N��[ݚYRY��X\�۔�YΈ�˜�X\�۔�Y��]N��˝]K��۝[���˘�۝[���۝[�\���˘�۝[�\��X�\�Y]��˜X�\�Y]��]�]J�˜X�\�Y]
H��[�X�[��N��˛X�[��K�K��[X����Y��YK�K�JN�]�Z]�\�XK�]�Y[��P�[�˙[]SX[�J��\�N����[Y[�Y�\�\�Y�˚Y�HJN�Y�
�˘�[��˛[���
H]�Z]�\�XK�]�Y[��P�[�˘ܙX]SX[�J]N��˘�[��˛X\

�[��HO�
Y��[�˚Y���[Y[�Y�\�\�Y�˚Y��[��[�^��[�˘�[��[�^�^��[�˝^��\���[���[�˘�\���[������[�˙[X�Y[�ՙX�܈��[X�Y[�ՙX�܎��[�˙[X�Y[�ՙX�܋�[X�Y[��[�[��[�˙[X�Y[��[�[�[X�Y[��[N��[�˙[X�Y[��[K�H��WJK�JJK���\\X�]\Έ�YK�JN�[���[\ܝY
�H�˘�[��˛[��B���[Y[��[\ܝY
��B���ۜ��K���]�Y[��H�ܜ\�[\ܝ��\]N�[�]Iܙ\���J�K�[�]
_X
N�ۜ��K����[[X\�N���[Y[��I���[Y[��[\ܝYH��\YI���[Y[����\YH�[���I��[���[\ܝYX
NH�[�[H]�Z]�\�XK�\��ۛ�X�

NB�B��XZ[�
K��]�

\��܊HO��ۜ��K�\��܊�]�Y[��H�ܜ\�[\ܝ�Z[Y�N�ۜ��K�\��܊\��܈[��[��[و\��܈�\��܋�Y\��Y�H���[��\��܊JN���\�˙^]
JNJN�