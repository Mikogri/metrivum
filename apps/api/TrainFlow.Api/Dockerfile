FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Build.targets Directory.Packages.props ./
COPY backend/ backend/
COPY apps/api/ apps/api/
RUN dotnet restore apps/api/TrainFlow.Api --locked-mode
RUN dotnet publish apps/api/TrainFlow.Api -c Release --no-restore -o /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /out ./
ENV ASPNETCORE_ENVIRONMENT=Production
USER $APP_UID
# Railway supplies PORT; the shell expands it before replacing itself with dotnet.
CMD ["sh", "-c", "exec dotnet TrainFlow.Api.dll --urls http://0.0.0.0:${PORT:-8080}"]
