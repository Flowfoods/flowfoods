-- 3C: somente a criação moderna usa recibo na própria ficha. Legado permanece NULL.
ALTER TABLE "FichaTecnica" ADD COLUMN "chaveEnvio" TEXT, ADD COLUMN "hashEnvio" TEXT;

ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_envio_conjunto_valido" CHECK (
  ("chaveEnvio" IS NULL AND "hashEnvio" IS NULL)
  OR ("chaveEnvio" IS NOT NULL AND "hashEnvio" IS NOT NULL
    AND "chaveEnvio" ~ '^[0-9a-f]{40}$' AND "hashEnvio" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "FichaTecnica_parceiroId_chaveEnvio_key" ON "FichaTecnica"("parceiroId", "chaveEnvio");

-- Edição/importação/arquivo nunca transformam uma criação já confirmada em outro pedido.
CREATE FUNCTION erp_ficha_envio_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW."chaveEnvio" IS DISTINCT FROM OLD."chaveEnvio" OR NEW."hashEnvio" IS DISTINCT FROM OLD."hashEnvio" THEN
    RAISE EXCEPTION 'A identidade do envio da ficha não muda.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FichaTecnica_envio_imutavel" BEFORE UPDATE ON "FichaTecnica"
FOR EACH ROW EXECUTE FUNCTION erp_ficha_envio_imutavel();
