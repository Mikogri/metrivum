FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Build.targets Directory.Packages.props ./
COPY backend/ backend/
COPY apps/api/ apps/api/
RUN dotnet restore apps/api/Metrivum.Api --locked-mode
RUN dotnet publish apps/api/Metrivum.Api -c Release --no-restore -o /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /out ./
# Public CA only; readable by APP_UID without changing the system trust store.
COPY --chmod=0444 infra/certs/supabase-prod-ca.crt /app/certs/supabase-prod-ca.crt
# Directory traversal needs execute permission independently of the file read mode.
RUN chmod 0755 /app/certs && chmod 0444 /app/certs/supabase-prod-ca.crt
ENV PGSSLROOTCERT=/app/certs/supabase-prod-ca.crt
ENV ASPNETCORE_ENVIRONMENT=Production
USER $APP_UID
RUN test "$(id -u)" -ne 0 && test -x /app/certs && test -r "$PGSSLROOTCERT" \
    && test ! -w /app/certs && test ! -w "$PGSSLROOTCERT" \
    && test -s "$PGSSLROOTCERT" && cat "$PGSSLROOTCERT" > /dev/null
# Railway supplies PORT; the shell expands it before replacing itself with dotnet.
CMD ["sh", "-c", "exec dotnet Metrivum.Api.dll --urls http://0.0.0.0:${PORT:-8080}"]
