using System.Security.Claims;
using Metrivum.BuildingBlocks;

namespace Metrivum.Api.Development;

public sealed record AccountErasureRequest(string Email);

/// <summary>
/// Development-only endpoints. They exist only when the API runs in Development with the owner connection
/// (ConnectionStrings:MigrationDatabase); anywhere else the routes are not mapped at all and answer 404.
/// </summary>
public static class DevelopmentEndpoints
{
    public static void MapDevelopmentTools(this WebApplication app)
    {
        var options = AccountEraserOptions.From(app.Configuration, app.Environment);
        if (options is null)
            return;
        var group = app.MapGroup("/api/v1/dev/account-erasure")
            .WithTags("Development")
            .RequireAuthorization();

        // What deleting the signed-in account would remove.
        group.MapGet(
            "",
            async (ClaimsPrincipal user, CancellationToken ct) =>
                Results.Ok(await AccountEraser.PreviewAsync(options, UserId(user), ct))
        );

        // Deletes the signed-in account with everything tied to it. The body repeats the account's email as confirmation.
        group.MapPost(
            "",
            async (AccountErasureRequest request, ClaimsPrincipal user, CancellationToken ct) =>
            {
                var email = user.FindFirst("email")?.Value;
                if (
                    string.IsNullOrWhiteSpace(email)
                    || !string.Equals(
                        request.Email?.Trim(),
                        email,
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                    throw new ApiException(
                        400,
                        "CONFIRMATION_MISMATCH",
                        "Type the email of the signed-in account to confirm."
                    );
                try
                {
                    return Results.Ok(await AccountEraser.EraseAsync(options, UserId(user), ct));
                }
                catch (InvalidOperationException error)
                {
                    throw new ApiException(502, "ERASURE_INCOMPLETE", error.Message);
                }
            }
        );
    }

    private static Guid UserId(ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirst("sub")?.Value, out var id) && id != Guid.Empty
            ? id
            : throw new ApiException(401, "UNAUTHENTICATED", "A valid user session is required.");
}
