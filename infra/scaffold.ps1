$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$projects = @{
    'backend/BuildingBlocks/TrainFlow.BuildingBlocks' = 'library'
    'backend/modules/Accounts/TrainFlow.Accounts.Contracts' = 'contract'
    'backend/modules/Access/TrainFlow.Access.Contracts' = 'contract'
    'backend/modules/ExerciseCatalog/TrainFlow.ExerciseCatalog.Contracts' = 'contract'
    'backend/modules/Media/TrainFlow.Media.Contracts' = 'contract'
    'backend/modules/Accounts/TrainFlow.Accounts' = 'module'
    'backend/modules/Access/TrainFlow.Access' = 'module'
    'backend/modules/ExerciseCatalog/TrainFlow.ExerciseCatalog' = 'module'
    'backend/modules/Training/TrainFlow.Training' = 'module'
    'backend/modules/Media/TrainFlow.Media' = 'module'
    'backend/modules/VideoAnalysis/TrainFlow.VideoAnalysis' = 'module'
    'apps/api/TrainFlow.Api' = 'web'
    'workers/TrainFlow.Worker' = 'worker'
    'tests/Unit/TrainFlow.UnitTests' = 'test'
    'tests/Integration/TrainFlow.IntegrationTests' = 'test'
    'tests/Architecture/TrainFlow.ArchitectureTests' = 'test'
}
foreach ($entry in $projects.GetEnumerator()) {
    New-Item $entry.Key -ItemType Directory -Force | Out-Null
    $name = Split-Path $entry.Key -Leaf
    $sdk = if ($entry.Value -eq 'web') { 'Microsoft.NET.Sdk.Web' } else { 'Microsoft.NET.Sdk' }
    $body = "<Project Sdk=`"$sdk`">`n"
    if ($entry.Value -in @('module','library')) {
        $body += '  <ItemGroup><FrameworkReference Include="Microsoft.AspNetCore.App" /><PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" /></ItemGroup>' + "`n"
    }
    if ($entry.Value -eq 'test') {
        $body += '  <PropertyGroup><IsTestProject>true</IsTestProject><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /><PackageReference Include="xunit" /><PackageReference Include="xunit.runner.visualstudio" PrivateAssets="all" /><Using Include="Xunit" /></ItemGroup>' + "`n"
    }
    if ($entry.Value -eq 'worker') { $body += '  <PropertyGroup><OutputType>Exe</OutputType></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.Extensions.Hosting" /></ItemGroup>' + "`n" }
    $body += '</Project>'
    Set-Content "$($entry.Key)/$name.csproj" $body
}
dotnet new sln -n TrainFlow
Get-ChildItem -Recurse -Filter *.csproj | ForEach-Object { dotnet sln TrainFlow.slnx add $_.FullName }
