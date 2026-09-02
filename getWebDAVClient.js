// import { AuthType, createClient } from 'https://esm.sh/webdav@5.10.0'

// const token =
//     'eyJhbGciOiJQUzI1NiIsImtpZCI6Ik9uU1RDMDhjbXhWendBMUtrb3YxdDNTQ3RNUWtyR3FOa1RzN1NjSHhlM28ifQ.eyJzdWJkb21haW4iOiJhZ2VudHNjcmlwdCIsInJvbGVzIjpbImFkbWluIl0sInN1YiI6ImV5M3FweDR2dDg5aWd0YzhvajhoZzJ3aiIsImlhdCI6MTc1MzEyNDczMSwiaXNzIjoiZXkzcXB4NHZ0ODlpZ3RjOG9qOGhnMndqIn0.2kdGyLZ64QNNTzEs4sNDK1dL0rclxOWtD_HiQTOXiiw1V0x_qIpvnM7l9bvKId7XHLePc1YnzaBwf0P2RjGb092YcwMK_4phospSWjRWSLU4nYRZcjvnV2xJ3c8IlBsmFI4Kw7k5BlSrvi5tznjwyNt5PZwn5XMwtdRG-qBktSbY3JJGxNFflFdyxPVWoPQNdXBHg-JFNNzQ6YcIvrr5R0L3RabX6M45tuNbcF0IBDDD2jO_NXSIPyTbcfvau5AyyQaP0vrLJqxaP_InRVj7JGoymyIZbxgmSS5edA_mzUPZ4LZfZEZ10Ukc0WYQzXpRwVVmYtbYkoILyEfum_1QEQ'

// const webdavServer = 'https://agentscript.acequia.io'

// export function getWebDAVClient() {
//     const client = createClient(webdavServer, {
//         authType: AuthType.Token,
//         token: { token_type: 'Bearer', access_token: token },
//     })
//     return [client, webdavServer]
// }

import { AuthType, createClient } from 'https://esm.sh/webdav@5.8.0'

// acequia dashboard token id
const token = 'cdob5b8163rju57m1215m1p6'

// acequia dashboard direct link
// https://agentscript.acequia.io/?token=cdob5b8163rju57m1215m1p6

// acequia dashboard JWT
// eyJhbGciOiJQUzI1NiIsImtpZCI6ImdUSXRHclBkVHZXQk9ISS0wSFk5S1BaVTVSZGtoVVRwRXpkTlpwYjYtRzQifQ.eyJhbmNob3IiOiJlNGRiNmU3YWYwZDdiMDllYWIzYTJmMTdkOGZhYWMyZDlmMGUzOTE0ODE2OTdjYjM1MjI1YmIwNzMxNjdkOWY1Iiwic2NvcGUiOnsicGF0aHMiOlsiKiJdLCJ3cml0ZVBhdGhzIjpbIioiXX0sInN1YiI6InZjZWNnd2F4Z3R2M3FkYmRqaG45cWExdiIsImlhdCI6MTc4ODM2MzgzMiwiYXVkIjoiYWdlbnRzY3JpcHQuYWNlcXVpYS5pbyIsImV4cCI6MTgxOTg5OTgzMn0.7rEJMdxgWzD0H8oichRFOVHPM0UTq70FGvLtcL4dsXQu-a4YZCoazaUOE_0ywFuVqEBVMhlLS2jE8Ng0s0ZX1rqgcSY7f0U-uCd40S7-Udrza_pGQKIfDuoizuMWD8bKYbO8S8t7VOHhsueoAcXkHyQWmofWuvzkPs3DBANcuEkGgy8I9pYxdCjyI2MoFGu7d0A0p_aAYte7sBSrArhqMr_d0rqCpS9ficHW_ROLNFHpaemTq0FpMJDI4aa8Oy7vJiNCS5GqA6_s_J7IdsPuMueMwwpFasaIWRYjNge5sj1XqpY2KmcMf98ZYlurgxbkv-sKIfPe1BK3TaGpYWB0hw

// acequia dashboard info
// Use the token ID or JWT in the Authorization header, auth_token cookie, or token query parameter. You can access these values anytime from your token list.

// initial
// 'eyJhbGciOiJQUzI1NiIsImtpZCI6Ik9uU1RDMDhjbXhWendBMUtrb3YxdDNTQ3RNUWtyR3FOa1RzN1NjSHhlM28ifQ.eyJzdWJkb21haW4iOiJhZ2VudHNjcmlwdCIsInJvbGVzIjpbImFkbWluIl0sInN1YiI6ImV5M3FweDR2dDg5aWd0YzhvajhoZzJ3aiIsImlhdCI6MTc1MzEyNDczMSwiaXNzIjoiZXkzcXB4NHZ0ODlpZ3RjOG9qOGhnMndqIn0.2kdGyLZ64QNNTzEs4sNDK1dL0rclxOWtD_HiQTOXiiw1V0x_qIpvnM7l9bvKId7XHLePc1YnzaBwf0P2RjGb092YcwMK_4phospSWjRWSLU4nYRZcjvnV2xJ3c8IlBsmFI4Kw7k5BlSrvi5tznjwyNt5PZwn5XMwtdRG-qBktSbY3JJGxNFflFdyxPVWoPQNdXBHg-JFNNzQ6YcIvrr5R0L3RabX6M45tuNbcF0IBDDD2jO_NXSIPyTbcfvau5AyyQaP0vrLJqxaP_InRVj7JGoymyIZbxgmSS5edA_mzUPZ4LZfZEZ10Ukc0WYQzXpRwVVmYtbYkoILyEfum_1QEQ'

const webdavServer = 'https://agentscript.acequia.io'

export function getWebDAVClient() {
    const client = createClient(webdavServer, {
        authType: AuthType.Token,
        token: { token_type: 'Bearer', access_token: token },
    })
    return [client, webdavServer]
}
